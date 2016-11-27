/* eslint-env mocha */
import chai from 'chai'
const expect = chai.expect
import {RenderingAudioContext as AudioContext} from 'web-audio-engine'
import BufferQueueNode from '..'

chai.use(function (chai, utils) {
  chai.Assertion.addProperty('silent', function () {
    var obj = utils.flag(this, 'object')
    expect(obj).to.be.a('float32array')
    expect(obj.filter(e => e !== 0)).to.be.empty
  })
})

describe('BufferQueueNode', function () {
  var audioContext
  var node
  describe('in object mode', function () {
    describe('for a single channel', function () {
      beforeEach(function () {
        audioContext = new AudioContext({
          sampleRate: 4096,
          numberOfChannels: 1,
          blockSize: 256
        })
        node = new BufferQueueNode({
          audioContext: audioContext,
          bufferSize: 256,
          objectMode: true
        })
        node.connect(audioContext.destination)
      })
      it('should emit silence without any data', function () {
        audioContext.processTo(1)
        const result = audioContext.exportAsAudioData().channelData[0].subarray(256)
        expect(result).to.be.silent
      })
      it('should handle a single Float32Array', function () {
        const input = Float32Array.of(0, 1, 2, 3, 4, 5, 6, 7)
        node.write(input)
        audioContext.processTo(1)
        const result = audioContext.exportAsAudioData().channelData[0].subarray(256)
        expect(result.subarray(0, 8)).to.deep.equal(input)
        expect(result.subarray(8)).to.be.silent
      })
      it('should handle a single Int16Array', function () {
        node.write(Int16Array.of(0, -(1 << 15), 0, (1 << 15) - 1))
        audioContext.processTo(1)
        const result = audioContext.exportAsAudioData().channelData[0].subarray(256)
        expect(result.subarray(0, 4)).to.deep.equal(Float32Array.of(0, -1, 0, 1))
        expect(result.subarray(4)).to.be.silent
      })
      it('should handle a single AudioBuffer', function () {
        const input = Float32Array.of(0, 1, 2, 3, 4, 5, 6, 7)
        const audioBuffer = audioContext.createBuffer(1, 8, 4096)
        audioBuffer.getChannelData(0).set(input)
        node.write(audioBuffer)
        audioContext.processTo(1)
        const result = audioContext.exportAsAudioData().channelData[0].subarray(256)
        expect(result.subarray(0, 8)).to.deep.equal(input)
        expect(result.subarray(8)).to.be.silent
      })
      it('should concatenate multiple buffers', function () {
        const input = Float32Array.of(0, 1, 2, 3, 4, 5, 6, 7)
        node.write(input.subarray(0, 1))
        node.write(input.subarray(1, 2))
        node.write(input.subarray(2, 4))
        node.write(input.subarray(4, 8))
        audioContext.processTo(1)
        const result = audioContext.exportAsAudioData().channelData[0].subarray(256)
        expect(result.subarray(0, 8)).to.deep.equal(input)
        expect(result.subarray(8)).to.be.silent
      })
      it('should concatenate multiple buffers across blocks', function () {
        node.write(new Float32Array(4092))
        const input = Float32Array.of(0, 1, 2, 3, 4, 5, 6, 7)
        node.write(input)
        audioContext.processTo(2)
        const result = audioContext.exportAsAudioData().channelData[0].subarray(256)
        expect(result.subarray(0, 4092)).to.be.silent
        expect(result.subarray(4092, 4100)).to.deep.equal(input)
        expect(result.subarray(4100)).to.be.silent
      })
    })
    describe('for two interleaved channels', function () {
      beforeEach(function () {
        audioContext = new AudioContext({
          sampleRate: 4096,
          numberOfChannels: 2,
          blockSize: 256
        })
        node = new BufferQueueNode({
          audioContext: audioContext,
          channels: 2,
          interleaved: true,
          bufferSize: 256,
          objectMode: true
        })
        node.connect(audioContext.destination)
      })
      it('should emit silence without any data', function () {
        audioContext.processTo(10)
        expect(audioContext.exportAsAudioData().channelData[0].subarray(256)).to.be.silent
        expect(audioContext.exportAsAudioData().channelData[1].subarray(256)).to.be.silent
      })
      it('should handle a single Float32Array', function () {
        const input = Float32Array.of(0, 1, 2, 3, 4, 5, 6, 7)
        node.write(input)
        audioContext.processTo(1)
        const audioData = audioContext.exportAsAudioData()
        const resultA = audioData.channelData[0].subarray(256)
        const resultB = audioData.channelData[1].subarray(256)
        expect(resultA.subarray(0, 4)).to.deep.equal(Float32Array.of(0, 2, 4, 6))
        expect(resultA.subarray(4)).to.be.silent
        expect(resultB.subarray(0, 4)).to.deep.equal(Float32Array.of(1, 3, 5, 7))
        expect(resultB.subarray(4)).to.be.silent
      })
      it('should handle a single Int16Array', function () {
        node.write(Int16Array.of(0, -(1 << 15), 0, (1 << 15) - 1))
        audioContext.processTo(1)
        const audioData = audioContext.exportAsAudioData()
        const resultA = audioData.channelData[0].subarray(256)
        const resultB = audioData.channelData[1].subarray(256)
        expect(resultA.subarray(0, 2)).to.deep.equal(Float32Array.of(0, 0))
        expect(resultA.subarray(2)).to.be.silent
        expect(resultB.subarray(0, 2)).to.deep.equal(Float32Array.of(-1, 1))
        expect(resultB.subarray(2)).to.be.silent
      })
      it('should handle a single AudioBuffer', function () {
        const inputA = Float32Array.of(0, 1, 2, 3)
        const inputB = Float32Array.of(4, 5, 6, 7)
        const audioBuffer = audioContext.createBuffer(2, 4, 4096)
        audioBuffer.getChannelData(0).set(inputA)
        audioBuffer.getChannelData(1).set(inputB)
        node.write(audioBuffer)
        audioContext.processTo(1)
        const audioData = audioContext.exportAsAudioData()
        const resultA = audioData.channelData[0].subarray(256)
        const resultB = audioData.channelData[1].subarray(256)
        expect(resultA.subarray(0, 4)).to.deep.equal(inputA)
        expect(resultA.subarray(4)).to.be.silent
        expect(resultB.subarray(0, 4)).to.deep.equal(inputB)
        expect(resultB.subarray(4)).to.be.silent
      })
      it('should concatenate multiple buffers', function () {
        const input = Float32Array.of(0, 1, 2, 3, 4, 5, 6, 7)
        node.write(input.subarray(0, 2))
        node.write(input.subarray(2, 4))
        node.write(input.subarray(4, 6))
        node.write(input.subarray(6, 8))
        audioContext.processTo(1)
        const audioData = audioContext.exportAsAudioData()
        const resultA = audioData.channelData[0].subarray(256)
        const resultB = audioData.channelData[1].subarray(256)
        expect(resultA.subarray(0, 4)).to.deep.equal(Float32Array.of(0, 2, 4, 6))
        expect(resultA.subarray(4)).to.be.silent
        expect(resultB.subarray(0, 4)).to.deep.equal(Float32Array.of(1, 3, 5, 7))
        expect(resultB.subarray(4)).to.be.silent
      })
    })
    describe('for two non interleaved channels', function () {
      beforeEach(function () {
        audioContext = new AudioContext({
          sampleRate: 4096,
          numberOfChannels: 2,
          blockSize: 256
        })
        node = new BufferQueueNode({
          audioContext: audioContext,
          channels: 2,
          interleaved: false,
          bufferSize: 256,
          objectMode: true
        })
        node.connect(audioContext.destination)
      })
      it('should emit silence without any data', function () {
        audioContext.processTo(10)
        expect(audioContext.exportAsAudioData().channelData[0].subarray(256)).to.be.silent
        expect(audioContext.exportAsAudioData().channelData[1].subarray(256)).to.be.silent
      })
      it('should handle a single Float32Array', function () {
        const input = Float32Array.of(0, 1, 2, 3, 4, 5, 6, 7)
        node.write(input)
        audioContext.processTo(1)
        const audioData = audioContext.exportAsAudioData()
        const resultA = audioData.channelData[0].subarray(256)
        const resultB = audioData.channelData[1].subarray(256)
        expect(resultA.subarray(0, 4)).to.deep.equal(Float32Array.of(0, 1, 2, 3))
        expect(resultA.subarray(4)).to.be.silent
        expect(resultB.subarray(0, 4)).to.deep.equal(Float32Array.of(4, 5, 6, 7))
        expect(resultB.subarray(4)).to.be.silent
      })
      it('should handle a single Int16Array', function () {
        node.write(Int16Array.of(0, -(1 << 15), 0, (1 << 15) - 1))
        audioContext.processTo(1)
        const audioData = audioContext.exportAsAudioData()
        const resultA = audioData.channelData[0].subarray(256)
        const resultB = audioData.channelData[1].subarray(256)
        expect(resultA.subarray(0, 2)).to.deep.equal(Float32Array.of(0, -1))
        expect(resultA.subarray(2)).to.be.silent
        expect(resultB.subarray(0, 2)).to.deep.equal(Float32Array.of(0, 1))
        expect(resultB.subarray(2)).to.be.silent
      })
      it('should handle a single AudioBuffer', function () {
        const inputA = Float32Array.of(0, 1, 2, 3)
        const inputB = Float32Array.of(4, 5, 6, 7)
        const audioBuffer = audioContext.createBuffer(2, 4, 4096)
        audioBuffer.getChannelData(0).set(inputA)
        audioBuffer.getChannelData(1).set(inputB)
        node.write(audioBuffer)
        audioContext.processTo(1)
        const audioData = audioContext.exportAsAudioData()
        const resultA = audioData.channelData[0].subarray(256)
        const resultB = audioData.channelData[1].subarray(256)
        expect(resultA.subarray(0, 4)).to.deep.equal(inputA)
        expect(resultA.subarray(4)).to.be.silent
        expect(resultB.subarray(0, 4)).to.deep.equal(inputB)
        expect(resultB.subarray(4)).to.be.silent
      })
      it('should concatenate multiple buffers', function () {
        const input = Float32Array.of(0, 1, 2, 3, 4, 5, 6, 7)
        node.write(input.subarray(0, 2))
        node.write(input.subarray(2, 4))
        node.write(input.subarray(4, 6))
        node.write(input.subarray(6, 8))
        audioContext.processTo(1)
        const audioData = audioContext.exportAsAudioData()
        const resultA = audioData.channelData[0].subarray(256)
        const resultB = audioData.channelData[1].subarray(256)
        expect(resultA.subarray(0, 4)).to.deep.equal(Float32Array.of(0, 2, 4, 6))
        expect(resultA.subarray(4)).to.be.silent
        expect(resultB.subarray(0, 4)).to.deep.equal(Float32Array.of(1, 3, 5, 7))
        expect(resultB.subarray(4)).to.be.silent
      })
    })
  })
  describe('not in object mode', function () {
    describe('for a single channel', function () {
      beforeEach(function () {
        audioContext = new AudioContext({
          sampleRate: 4096,
          numberOfChannels: 1,
          blockSize: 256
        })
        node = new BufferQueueNode({
          audioContext: audioContext,
          channels: 1,
          bufferSize: 256
        })
        node.connect(audioContext.destination)
      })
      it('should handle Float32Array-like data', function () {
        node = new BufferQueueNode({
          dataType: BufferQueueNode.Float32Array,
          audioContext: audioContext,
          channels: 1,
          bufferSize: 256
        })
        node.connect(audioContext.destination)

        const input = Float32Array.of(0, 1, 2, 3, 4, 5, 6, 7)
        node.write(Buffer.from(input.buffer))
        audioContext.processTo(1)
        const result = audioContext.exportAsAudioData().channelData[0].subarray(256)
        expect(result.subarray(0, 8)).to.deep.equal(input)
        expect(result.subarray(8)).to.be.silent
      })
      it('should handle Int16Array-like data', function () {
        node = new BufferQueueNode({
          dataType: BufferQueueNode.Int16Array,
          audioContext: audioContext,
          channels: 1,
          bufferSize: 256
        })
        node.connect(audioContext.destination)

        const input = Int16Array.of(0, (1 << 15) - 1, 0, -(1 << 15))
        node.write(Buffer.from(input.buffer))
        audioContext.processTo(1)
        const result = audioContext.exportAsAudioData().channelData[0].subarray(256)
        expect(result.subarray(0, 4)).to.deep.equal(Float32Array.of(0, 1, 0, -1))
        expect(result.subarray(4)).to.be.silent
      })
    })
  })
})
