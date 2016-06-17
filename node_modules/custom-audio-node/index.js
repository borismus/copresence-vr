var createAudioParam = require('./audio-param')

module.exports = function(input, output, params, onDestinationChange){
  var audioContext = (input || output).context

  var node = audioContext.createGain()
  node._onDestinationChange = onDestinationChange

  if (input){
    node.connect(input)
  }

  node._output = output
  node._targetCount = 0

  if (output){
    node.connect = connect
    node.disconnect = disconnect
  }

  addAudioParams(node, params)

  return node
}

module.exports.createAudioParam = createAudioParam

function connect(destination, channel){
  this._targetCount += 1
  this._output.connect(destination, channel)
  if (typeof this._onDestinationChange === 'function'){
    this._onDestinationChange(this._targetCount)
  }
}

function disconnect(param){
  this._targetCount = 0
  this._output.disconnect(param)
  if (typeof this._onDestinationChange === 'function'){
    this._onDestinationChange(this._targetCount)
  }
}

function addAudioParams(node, params){
  if (params){
    var keys = Object.keys(params)
    for (var i=0,l=keys.length;i<l;i++){
      var key = keys[i]
      node[key] = createAudioParam(node.context, key, params[key])
    }
  }
}