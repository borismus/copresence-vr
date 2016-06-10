var FirebaseSignal = require('./firebase-signal');
var PeerConnection = require('./peer-connection');

function onLoad() {
  pc = new PeerConnection();
  pc.on('ready', function(peerId) {
    fb = new FirebaseSignal(peerId);

    // Show all available users.
    fb.on('usersChanged', onUsersChanged);
  });

  pc.on('opened', function() {
    fb.connect();
  });
  pc.on('disconnected', function() {
    fb.disconnect();
  });

  // When a remote stream is available, show it.
  pc.on('remoteStream', function(stream) {
    var video = document.querySelector('video#remote');
    video.src = URL.createObjectURL(stream);
  });

  callButton = document.querySelector('button#call');
  callButton.disabled = true;

  callButton.addEventListener('click', onCallUser);
}

function onUsersChanged(users) {
  console.log('onUsersChanged', users);
  var userList = document.querySelector('#user-list');
  userList.innerHTML = '';
  for (var id in users) {
    var user = users[id];
    // Ignore yourself, and users that aren't available.
    if (user.peerId == pc.getPeerId() || !user.isAvailable) {
      continue;
    }
    var li = createUser(user);
    userList.appendChild(li);
  }
}

function createUser(user) {
  var li = document.createElement('li');
  li.classList.add('mdl-list__item');
  li.innerHTML = ['<span class="mdl-list__item-primary-content">',
    '<i class="material-icons mdl-list__item-icon">person</i>',
    user.peerId,
    '</span>'].join('\n');

  li.addEventListener('click', function(e) {
    li.style.background = 'lightblue';
    callButton.disabled = false;
    selectedUser = user;
  });
  return li;
}

function onCallUser() {
  pc.connect(selectedUser.peerId);
}

window.addEventListener('load', onLoad);
