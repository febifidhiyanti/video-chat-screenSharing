const possibleEmojis = [
  '🐀','🐁','🐭','🐹','🐂','🐃','🐄','🐮','🐅','🐆','🐯','🐇','🐐','🐑','🐏','🐴',
  '🐎','🐱','🐈','🐰','🐓','🐔','🐤','🐣','🐥','🐦','🐧','🐘','🐩','🐕','🐷','🐖',
  '🐗','🐫','🐪','🐶','🐺','🐻','🐨','🐼','🐵','🙈','🙉','🙊','🐒','🐉','🐲','🐊',
  '🐍','🐢','🐸','🐋','🐳','🐬','🐙','🐟','🐠','🐡','🐚','🐌','🐛','🐜','🐝','🐞',
];
function randomEmoji() {
  var randomIndex = Math.floor(Math.random() * possibleEmojis.length);
  return possibleEmojis[randomIndex];
}

const CLIENT = 'nmjY7KLivcQlwOBh' ;
const emoji = randomEmoji();
const name = prompt("What's your name?");

// Menghasilkan nama room acak
if (!location.hash) {
  location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const roomHash = location.hash.substring(1);



// TODO: Replace with your own channel ID
const drone = new ScaleDrone(CLIENT);

let members = [];

// Nama room harus diawali dengan 'observable-'
const roomName = 'observable-' + roomHash;

let room;

const configuration = {
  iceServers: [{
    urls: 'stun:stun.l.google.com:19302'
  }]
};
let pc;
let dataChannel;


function onSuccess() {};
function onError(error) {
  console.error(error);
};

drone.on('open', error => {
  if (error) {
    return console.error(error);
  }
  console.log('Successfully connected to Room');

 room = drone.subscribe(roomName);
  room.on('open', error => {
    if (error) {
      return onError(error);
    }
    console.log('Connected to signaling server');
  });

  // Terhubung ke room dan menerima berbagai 'anggota'
  // terhubung ke room. Server pensinyalan sudah siap.
  room.on('members', members => {
    if (members.length >= 3) {
      return alert('The room is full');
    }
    // Jika kami adalah pengguna kedua yang terhubung ke room, kami akan membuat penawaran
    const ls = members.length === 2;
    startWebRTC(ls);
  });
});

//Kirim data pensinyalan melalui Scaledrone
function sendMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}

function startWebRTC(ls) {
  console.log('Starting WebRTC in as', ls ? 'offerer' : 'waiter');
  pc = new RTCPeerConnection(configuration);

  // 'onicecandidate' memberi tahu kami setiap kali agen ICE perlu mengirimkan a
  // pesan ke peer lain melalui server pensinyalan
  pc.onicecandidate = event => {
    if (event.candidate) {
      sendMessage({'candidate': event.candidate});
    }
  };

  // Jika pengguna adalah penawar, biarkan acara 'dibutuhkan negosiasi' yang membuat penawaran
  if (ls) {
    pc.onnegotiationneeded = () => {
      pc.createOffer().then(localDescCreated).catch(onError);
      
    }
    dataChannel = pc.createDataChannel('chat');
    setupDataChannel();
  }  else {
    // If user is not the offerer let wait for a data channel
    pc.ondatachannel = event => {
      dataChannel = event.channel;
      setupDataChannel();
    }
  }

// bagian <chat>

  // Saat aliran jarak jauh tiba, tampilkan di elemen #remoteVideo
  pc.ontrack = event => {
    const stream = event.streams[0];
    if (!remoteVideo.srcObject || remoteVideo.srcObject.id !== stream.id) {
      remoteVideo.srcObject = stream;
    }
  };

  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  }).then(stream => {
    // Tampilkan video lokal Anda dalam elemen #localVideo
    localVideo.srcObject = stream;
    // Tambahkan aliran Anda untuk dikirim ke rekan yang terhubung
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
  }, onError);

// yang diatas nggk ada <chat>

  // Dengarkan data pensinyalan dari Scaledrone
  room.on('data', (message, client) => {
    // Pesan telah dikirim oleh kami
    if (client.id === drone.clientId) {
      return;
    }

    if (message.sdp) {
      // Ini dipanggil setelah menerima tawaran atau jawaban dari rekan lain
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        // Saat menerima tawaran mari kita jawab
        if (pc.remoteDescription.type === 'offer') {
          pc.createAnswer().then(localDescCreated).catch(onError);
        }
      }, onError);
    } else if (message.candidate) {
      // Tambahkan kandidat ICE baru ke deskripsi jarak jauh koneksi kami
      pc.addIceCandidate(
        new RTCIceCandidate(message.candidate), onSuccess, onError
      );
    }
  });
  startListentingToSignals();
} 

function startListentingToSignals() {
  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    // Message was sent by us
    if (client.id === drone.clientId) {
      return;
    }
    if (message.sdp) {
      // This is called after receiving an offer or answer from another peer
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        console.log('pc.remoteDescription.type', pc.remoteDescription.type);
        // When receiving an offer lets answer it
        if (pc.remoteDescription.type === 'offer') {
          console.log('Answering offer');
          pc.createAnswer(localDescCreated, error => console.error(error));
        }
      }, error => console.error(error));
    } else if (message.candidate) {
      // Add the new ICE candidate to our connections remote description
      pc.addIceCandidate(new RTCIceCandidate(message.candidate));
    }
  });
}

function localDescCreated(desc) {
  pc.setLocalDescription(
    desc,
    () => sendMessage({'sdp': pc.localDescription}),
    onError
  );
}

// Hook up data channel event handlers
function setupDataChannel() {
  checkDataChannelState();
  dataChannel.onopen = checkDataChannelState;
  dataChannel.onclose = checkDataChannelState;
  dataChannel.onmessage = event =>
    insertMessageToDOM(JSON.parse(event.data), false)
}

function checkDataChannelState() {
  console.log('WebRTC channel state is:', dataChannel.readyState);
  if (dataChannel.readyState === 'open') {
    insertMessageToDOM({content: 'Member have been join'});
  }
}

function insertMessageToDOM(options, isFromMe) {
  const template = document.querySelector('template[data-template="message"]');
  const nameEl = template.content.querySelector('.message__name');
  if (options.emoji || options.name) {
    nameEl.innerText = options.emoji + ' ' + options.name;
  }
  template.content.querySelector('.message__bubble').innerText = options.content;
  const clone = document.importNode(template.content, true);
  const messageEl = clone.querySelector('.message');
  if (isFromMe) {
    messageEl.classList.add('message--mine');
  } else {
    messageEl.classList.add('message--theirs');
  }

  const messagesEl = document.querySelector('.messages');
  messagesEl.appendChild(clone);

  // Scroll to bottom
  messagesEl.scrollTop = messagesEl.scrollHeight - messagesEl.clientHeight;
}

const form = document.querySelector('form');
form.addEventListener('submit', () => {
  const input = document.querySelector('input[type="text"]');
  const value = input.value;
  input.value = '';

  const data = {
    name,
    content: value,
    emoji,
  };

  dataChannel.send(JSON.stringify(data));

  insertMessageToDOM(data, true);
});

insertMessageToDOM({content: 'Chat URL is ' + location.href});
