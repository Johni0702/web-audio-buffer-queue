# web-audio-buffer-queue

This module provides a Web Audio API source node that streams (Audio)Buffers from
a queue or Node-style Stream.

### Usage

```javascript
import BufferQueueNode from 'web-audio-buffer-queue'

var node = new BufferQueueNode({
  audioContext: audioContext
})
node.connect(audioContext.destination)

node.write(bufferContainingPCMSamples)
```

See `src/index.js` for detailed documentation.

### License
ISC
