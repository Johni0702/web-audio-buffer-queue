import globalAudioContext from 'audio-context'
import extend from 'extend'
import { Writable } from 'stream'

/**
 * A source node that plays queued PCM buffers.
 *
 * When no more data is queued, this node emits silence.
 *
 * The queued buffers are played at the frequency of the audio context.
 *
 * Multiple channels are supported, both interleaved and
 * non interleaved layouts. Every single buffer queued is expected
 * to contain the same amount of samples for every channel. Therefore a single
 * frame may not be split across mutliple buffers.
 *
 * When in object mode, the input format is determined automatically.
 * Supported formats are Float32Array, Int16Array and AudioBuffer.
 * When not in object mode, the input format has to be specified manually by
 * passing {@link BufferQueueNode#Float32Array} or {@link BufferQueueNode#Int16Array}
 * to the constructor.
 *
 * Note that this does only implement a small part of the AudioNode interface.
 * This node will disconnect automatically when its stream is closed.
 *
 * @extends Writable
 */
class BufferQueueNode extends Writable {
  /**
   * Create a BufferQueueNode.
   * @param {Object} [options] - Options passed to the Writable constructor.
   * @param {AudioBufferFormat} [options.dataType=BufferQueueNode.Float32Array] -
   *    Format of input data when not in objectMode.
   * @param {boolean} [options.interleaved=true] - Whether the input data is interleaved
   * @param {number} [options.channels=1] - Number of channels
   * @param {number} [options.bufferSize=0] - Buffer size, must be a power of two
   *    between 256 and 16284. May also be 0 in which case the implementation will
   *    pick a good value (recommanded).
   * @param {AudioContext} [options.audioContext=require('audio-context')] - The audio context
   */
  constructor (options) {
    super(options)

    options = extend({
      dataType: Float32ArrayBuffer,
      objectMode: false,
      interleaved: true,
      channels: 1,
      bufferSize: 0,
      audioContext: globalAudioContext
    }, options)
    this._dataType = options.dataType
    this._objectMode = options.objectMode
    this._interleaved = options.interleaved
    const channels = this._channels = options.channels
    const bufferSize = options.bufferSize
    const audioContext = options.audioContext
    // const sampleRate = audioContext.sampleRate

    // Queue that holds all future audio buffer
    this._queue = []

    // Create a script processor node that will inject our samples
    var processorNode = audioContext.createScriptProcessor(bufferSize, 0, channels)
    // Create a buffer source that will power the script processor
    // Note: This isn't strictly required, however some browsers are buggy
    var inputNode = audioContext.createBufferSource()
    // That source should be looping over a short, silent buffer
    inputNode.loop = true

    var shuttingDown = false
    var shutDown = false
    // The buffer which holds the current audio data
    var currentBuffer = null
    // Offset into the current buffer
    var currentBufferOffset
    processorNode.addEventListener('audioprocess', (e) => {
      if (shutDown) {
        // Already shut down
        return
      }
      const out = e.outputBuffer
      // Offset into the output buffer
      let outOffset = 0
      // Try to fill the whole output buffer
      while (outOffset < out.length) {
        // If we don't have a current buffer but there are some in the queue
        if (!currentBuffer && this._queue.length > 0) {
          // Then get the next queued buffer from the queue
          currentBuffer = this._queue.shift()
          currentBufferOffset = 0
        }
        // If we still don't have any data,
        if (!currentBuffer) {
          // then fill the rest of the output with silence
          for (let channel = 0; channel < channels; channel++) {
            out.getChannelData(channel).fill(0, outOffset)
          }
          // and shut down if requested
          if (shuttingDown) {
            shutDown = true
            process.nextTick(() => this.emit('close'))
          }
          break
        }
        // Otherwise (we have data), copy as much as possible
        const remainingOutput = out.length - outOffset
        const remainingInput = currentBuffer.length - currentBufferOffset
        const remaining = Math.min(remainingOutput, remainingInput)
        // Do the actual copying
        currentBuffer.copyTo(out, outOffset, currentBufferOffset, remaining)
        // Increase offsets
        currentBufferOffset += remaining
        outOffset += remaining
        // Check if there is still data remaining in the current buffer
        if (currentBufferOffset >= currentBuffer.length) {
          currentBuffer = null
        }
      }
    })
    // Connect the input node to the script processor
    // inputNode.connect(processorNode)
    // inputNode.start()

    // Store node for later connecting
    this._node = processorNode

    this.on('finish', () => {
      shuttingDown = true
    })
    this.on('close', () => {
      processorNode.disconnect()
    })
  }

  /**
   * Connect this node to another node.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/AudioNode/connect(AudioNode)
   */
  connect () {
    return this._node.connect.apply(this._node, arguments)
  }

  /**
   * Disconnect this node from another node.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/AudioNode/disconnect
   */
  disconnect () {
    return this._node.disconnect.apply(this._node, arguments)
  }

  _write (chunk, encoding, callback) {
    if (this._objectMode) {
      if (chunk instanceof Float32Array) {
        chunk = new Float32ArrayBuffer(this._channels, this._interleaved, chunk)
      } else if (chunk instanceof Int16Array) {
        chunk = new Int16ArrayBuffer(this._channels, this._interleaved, chunk)
      } else {
        chunk = new AudioBufferBuffer(chunk)
      }
    } else {
      chunk = new (this._dataType)(this._channels, this._interleaved, chunk)
    }
    this._queue.push(chunk)
    callback(null)
  }
}

/**
 * @interface AudioBufferFormat
 */

/**
 * Copy samples from this buffer to the target AudioBuffer.
 *
 * @function
 * @name AudioBufferFormat#copyTo
 * @param {AudioBuffer} to - The target audio buffer
 * @param {number} toOffset - Offset into the target audio buffer
 * @param {number} fromOffset - Offset into this buffer
 * @param {number} length - Amount of sample-frames to copy
 */

/** @implements AudioBufferFormat */
class AudioBufferBuffer {
  constructor (it) {
    this._it = it
  }

  get length () {
    return this._it.length
  }

  copyTo (to, toOffset, fromOffset, length) {
    for (let channel = 0; channel < this._it.numberOfChannels; channel++) {
      const source = this._it.getChannelData(channel)
      to.copyToChannel(source.subarray(fromOffset, fromOffset + length), channel, toOffset)
    }
  }
}

class TypedArrayBuffer {
  constructor (channels, interleaved, it) {
    this._channels = channels
    this._interleaved = interleaved
    this._it = it
  }

  get length () {
    return this._it.length / this._channels
  }

  /**
   * Return the sample at the specified offset
   * @param {number} i - The offset
   * @returns {number} The sample
   */
  _get (i) {
    return this._it[i]
  }

  /**
   * Copy some samples to the specified array.
   * @param {Float32Array} to - The target array
   * @param {number} toOffset - Offset into the target array
   * @param {number} fromOffset - Offset into this array
   * @param {number} length - Amount of samples to copy
   */
  _bulkCopy (to, toOffset, fromOffset, length) {
    to.set(this._it.subarray(fromOffset, fromOffset + length), toOffset)
  }

  copyTo (to, toOffset, fromOffset, length) {
    for (let channel = 0; channel < this._channels; channel++) {
      const channelData = to.getChannelData(channel)
      if (this._interleaved && this._channels > 1) {
        // For interleaved data we have to copy every sample on its own
        for (let i = 0; i < length; i++) {
          const actualFromOffset = (fromOffset + i) * this._channels + channel
          channelData[toOffset + i] = this._get(actualFromOffset)
        }
      } else {
        // Otherwise we can do a bulk copy
        const actualFromOffset = this.length * channel + fromOffset
        this._bulkCopy(channelData, toOffset, actualFromOffset, length)
      }
    }
  }
}

/** @implements AudioBufferFormat */
class Float32ArrayBuffer extends TypedArrayBuffer {
  constructor (channels, interleaved, it) {
    if (it instanceof Buffer) {
      it = new Float32Array(it.buffer, it.byteOffset, it.byteLength / 4)
    } else if (!(it instanceof Float32Array)) {
      throw new Error('Unsupported buffer type: ' + it)
    }
    super(channels, interleaved, it)
  }
}

/** @implements AudioBufferFormat */
class Int16ArrayBuffer extends TypedArrayBuffer {
  constructor (channels, interleaved, it) {
    if (it instanceof Buffer) {
      it = new Int16Array(it.buffer, it.byteOffset, it.byteLength / 2)
    } else if (!(it instanceof Int16Array)) {
      throw new Error('Unsupported buffer type: ' + it)
    }
    super(channels, interleaved, it)
  }

  /** @see TypedArrayBuffer#_get */
  _get (i) {
    const val = this._it[i]
    return val / ((1 << 15) - (val > 0 ? 1 : 0))
  }

  /** @see TypedArrayBuffer#_bulkCopy */
  _bulkCopy (to, toOffset, fromOffset, length) {
    for (let i = 0; i < length; i++) {
      to[toOffset + i] = this._get(fromOffset + i)
    }
  }
}

BufferQueueNode.AudioBuffer = AudioBufferBuffer
BufferQueueNode.Float32Array = Float32ArrayBuffer
BufferQueueNode.Int16Array = Int16ArrayBuffer
export default BufferQueueNode
