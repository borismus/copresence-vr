# Reliable transfer over DataChannels


## Reliable

`new Reliable(dc)`: A reliable utility class for DataChannel. Takes in a `DataChannel` object.
* `.send(msg)`: Takes any message and sends it reliably.
* `.onmessage(msg)`: Called when data is received.

`Reliable.higherBandwidthSDP(sdp)`: This need to be applied to all offer/answer SDPs for Reliable to function properly. Returns the new SDP with added bandwidth. See usage below.

```js
// Assuming 2 PeerConnections pc1, pc2.
pc1.createOffer(function(offer) {
  offer.sdp = Reliable.higherBandwidthSDP(offer.sdp);
  pc1.setLocalDescription(offer, ...);
});

...

// Same process for answer.
pc2.createAnswer(function(answer) {
  answer.sdp = Reliable.higherBandwidthSDP(answer.sdp);
  pc2.setLocalDescription(answer, ...);
});
```

## Internal message format

### ACK

This is an ACK for a chunk of the message.

```js
[
  /* type */  'ack',
  /* id */    message_id,
  /* ACK */   n   // The next chunk # expected.
]
```

### Chunk

This is a chunk of the message.

```js
[
  /* type */  'chunk',
  /* id */    message_id,
  /* n */     n,       // The chunk #.
  /* chunk */ chunk   // The actual binary chunk.
]
```


### END

This is the end of a message.

```js
[
  /* type */  'end',
  /* id */    message_id,
  /* n */     n       // The last index.
]
```


### Unchunked message

This is a message that was able to be sent without being chunked.

```js
[
  /* type */  'no',
  /* msg */   payload
]
```

## Future plans

Use stream API.
