module.exports = function(audioContext, name, options){
  // options: provider, target(s)

  options = options || {}

  var targets = options.targets

  if (!targets && options.target){
    targets = [options.target]
  } else if (!targets){
    targets = []
  }

  var param = Object.create(AudioParam.prototype, {
    value: {
      get: function(){
        return param._lastValue
      },
      set: function(value){
        value = param.fence(value)
        param._lastValue = value
        for (var i=0,l=targets.length;i<l;i++){
          var target = targets[i]
          target.value = value
        }
      }
    },
    defaultValue: {
      get: function(){
        return options.defaultValue
      }
    },
    name: {
      value: name,
      writable: false
    },
    min: {
      value: options.min,
      writable: false
    },
    max: {
      value: options.max,
      writable: false
    }
  })



  param._targets = targets
  param._lastValue = options.defaultValue

  // override proto-methods
  param.setValueAtTime = setValueAtTime
  param.linearRampToValueAtTime = linearRampToValueAtTime
  param.exponentialRampToValueAtTime = exponentialRampToValueAtTime
  param.setTargetAtTime = setTargetAtTime
  param.setValueCurveAtTime = setValueCurveAtTime
  param.cancelScheduledValues = cancelScheduledValues
  param.addTarget = addTarget
  param.clearTargets = clearTargets
  param.context = audioContext

  // get value between min and max
  param.fence = fence
  
  // set initial value
  if (options.defaultValue != null){
    param.value = options.defaultValue
  }

  return param
}

function fence(value){
  if (this.min != null){
    value = Math.max(this.min, value)
  }

  if (this.max != null){
    value = Math.min(this.max, value)

  }
  return value
}

function setValueAtTime(value, startTime){
  var targets = this._targets
  value = this.fence(value)

  this._lastValue = value

  for (var i=0,l=targets.length;i<l;i++){
    targets[i].setValueAtTime(value, startTime)
  }
}

function setTargetAtTime(value, startTime, timeConstant){
  // this needs to be rewritten to use custom curve
  var targets = this._targets
  value = this.fence(value)
  for (var i=0,l=targets.length;i<l;i++){
    if (targets[i].setTargetAtTime){
      targets[i].setTargetAtTime(value, startTime, timeConstant)
    }
  }
}

function linearRampToValueAtTime(value, endTime){
  var targets = this._targets
  value = this.fence(value)

  this._lastValue = value

  for (var i=0,l=targets.length;i<l;i++){
    targets[i].linearRampToValueAtTime(value, endTime)
  }
}

function exponentialRampToValueAtTime(value, endTime){
  var targets = this._targets
  value = this.fence(value)

  this._lastValue = value

  for (var i=0,l=targets.length;i<l;i++){
    targets[i].exponentialRampToValueAtTime(value, endTime)
  }
}

function setValueCurveAtTime(curve, startTime, duration){
  var targets = this._targets
  this._lastValue = curve[curve.length-1]

  for (var i=0,l=targets.length;i<l;i++){
    targets[i].setValueCurveAtTime(curve, startTime, duration)
  }
}

function cancelScheduledValues(startTime){
  var targets = this._targets
  for (var i=0,l=targets.length;i<l;i++){
    targets[i].cancelScheduledValues(startTime)
  }
}

function clearTargets(){
  this._targets = []
}

function addTarget(target){
  this._targets.push(target)
  if (this._lastValue != null){
    target.value = this._lastValue
  }
}