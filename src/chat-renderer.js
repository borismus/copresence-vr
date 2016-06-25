// TODO(smus): Remove this assumption once THREE modules are require-compatible.
// Assumes THREE, THREE.VREffect and THREE.VRControls, THREE.OBJLoader and
// THREE.MTLLoader have been loaded.
var EventEmitter = require('eventemitter3');
var Pose = require('./pose');
require('webvr-polyfill');
var Util = require('./util');
// TODO(smus): Make this more require-y.
require('webvr-boilerplate');

/**
 * Renders the chat world, which includes the person you are chatting with, and
 * some other objects that can be manipulated.
 *
 * Functionality
 *   Look around the world.
 *   Move around the world by looking on the ground and clicking.
 *   TODO(smus): Shrink/grow yourself, and the other peer.
 */
function ChatRenderer() {
  this.scale = 0.5;

  this.init_();
}
ChatRenderer.prototype = new EventEmitter();

ChatRenderer.prototype.init_ = function() {
  var container = document.querySelector('body');
  
  // Create the renderer.
  var renderer = new THREE.WebGLRenderer();
  renderer.setClearColor(0xf0f0f0);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);
  
  // The scene to render.
  scene = new THREE.Scene();

  var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight,
                                           0.1, 10000);

  // Put the camera on a dolly.
  dolly = new THREE.Group();
  dolly.position.set(0, this.scale, 0);
  scene.add(dolly);
  dolly.add(camera);

  // Apply VR headset positional data to camera.
  controls = new THREE.VRControls(camera);

  // Apply VR stereo rendering to renderer.
  effect = new THREE.VREffect(renderer);
  effect.setSize(window.innerWidth, window.innerHeight);

  // WebVR Boilerplate.
  this.manager = new WebVRManager(renderer, effect);

  // Add lighting.
  var light = new THREE.DirectionalLight(0xefefff, 1.5);
  light.position.set(1, 1, 1).normalize();
  scene.add(light);
  
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();

  // Load grass, and tile it to make the scene.
  Util.loadObj('models/gras_flat_1').then(function(mesh) {
    var field = Util.tileMesh2D(mesh.children[0]);
    field.name = 'field';
    scene.add(field);
  });

  var marker = Util.createTorus();
  marker.rotation.x = Math.PI/2;
  marker.name = 'teleportMarker';
  marker.visible = false;
  scene.add(marker);


  // Add a shrink and grow marker in camera space.
  var marker = Util.createTorus({color: 0xff0000});
  marker.name = 'growMarker';
  marker.visible = false;
  marker.position.z = -5;
  camera.add(marker);

  var marker = Util.createTorus({color: 0x0000ff});
  marker.name = 'shrinkMarker';
  marker.visible = false;
  marker.position.z = -1;
  marker.scale.set(0.1, 0.1, 0.1);
  camera.add(marker);


  // Set up event listeners.
  this.boundMouseMove = this.onMouseMove_.bind(this);
  this.boundKeyUp = this.onKeyUp_.bind(this);
  this.boundTouchEnd = this.onTouchEnd_.bind(this);
  window.addEventListener('mousemove', this.boundMouseMove, false);
  window.addEventListener('keyup', this.boundKeyUp, false);
  window.addEventListener('touchend', this.boundTouchEnd, false);

  // Save many of the instantiated objects for later reference.
  this.renderer = renderer;
  this.controls = controls;
  this.effect = effect;
  this.camera = camera;
  this.dolly = dolly;
  this.scene = scene;
  this.mouse = mouse;
  this.raycaster = raycaster;
};

ChatRenderer.prototype.destroy = function() {
  // Remove the canvas itself.
  var container = document.querySelector('body');
  container.removeChild(this.renderer.domElement);

  // Remove all bound event handlers.
  window.removeEventListener('mousemove', this.boundMouseMove, false);
  window.removeEventListener('keyup', this.boundKeyUp, false);
  window.removeEventListener('touchend', this.boundTouchEnd, false);
};

ChatRenderer.prototype.render = function(ts) {
  this.controls.update();

  this.manager.render(this.scene, this.camera, ts);
  //this.effect.render(this.scene, this.camera);

  this.raycast_();
};

ChatRenderer.prototype.onResize = function() {
  this.effect.setSize(window.innerWidth, window.innerHeight);
  this.camera.aspect = window.innerWidth / window.innerHeight;
  this.camera.updateProjectionMatrix();
};

/**
 * Returns the 6DOF pose as an object: {
 *   quaternion: Quaternion(x, y, z, w),
 *   position: Vector3(x, y, z),
 *   scale: Number
 * }
 */
ChatRenderer.prototype.getPose = function() {
  var position = this.dolly.position.clone();
  position.y = 0;
  return new Pose(this.camera.quaternion, position, this.scale);
};

ChatRenderer.prototype.onMouseMove_ = function(e) {
  // Calculate mouse position in normalized device coordinates (-1 to +1) for
  // both components.
	this.mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	this.mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;		
};


ChatRenderer.prototype.onKeyUp_ = function(e) {
  // Temporarily treat space bar as a Cardboard button click.
  if (e.keyCode == 32) {
    this.onCardboardClick_();
  }
};

ChatRenderer.prototype.onTouchEnd_ = function(e) {
  this.onCardboardClick_();
};

ChatRenderer.prototype.onCardboardClick_ = function() {
  // If there's a visible teleport marker, go to there!
  var teleportMarker = this.scene.getObjectByName('teleportMarker');
  if (teleportMarker.visible) {
    // Teleport to the position of the marker..
    this.dolly.position.copy(teleportMarker.position);
    this.dolly.position.y = this.scale;
  }

  // If there's a visible scale marker, do the scaling!
  var growMarker = this.scene.getObjectByName('growMarker');
  if (growMarker.visible) {
    this.setScale_(this.scale * 1.5);
  }

  var shrinkMarker = this.scene.getObjectByName('shrinkMarker');
  if (shrinkMarker.visible) {
    this.setScale_(this.scale / 1.5);
  }
};

ChatRenderer.prototype.setScale_ = function(newScale) {
  var oldScale = this.scale;
  this.scale = newScale;
  this.dolly.position.y = this.scale;
  this.emit('scale', newScale, oldScale);
};

ChatRenderer.prototype.raycast_ = function() {
  // Update the picking ray with the camera and mouse position	
  this.raycaster.setFromCamera(this.mouse, this.camera);	

  var field = this.scene.getObjectByName('field');
  if (!field) {
    return;
  }

  // Handle looking way up and way down.
  var shrinkMarker = this.scene.getObjectByName('shrinkMarker');
  var growMarker = this.scene.getObjectByName('growMarker');
  this.camera.rotation.reorder('YXZ');
  var pitchDeg = THREE.Math.radToDeg(this.camera.rotation.x);
  growMarker.visible = (pitchDeg > 80);
  shrinkMarker.visible = (pitchDeg < -80);

  // If shrink or grow marker are visible, hide the teleport marker.
  var teleportMarker = this.scene.getObjectByName('teleportMarker');
  var intersects = this.raycaster.intersectObject(field, true);
  if (intersects.length > 0 && !growMarker.visible && !shrinkMarker.visible) {
    var inter = intersects[0];
    teleportMarker.visible = true;
    teleportMarker.position.copy(inter.point);
  } else {
    teleportMarker.visible = false;
  }
};

module.exports = ChatRenderer;
