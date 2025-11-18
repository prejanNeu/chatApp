// DOM
const messages = document.querySelectorAll("[data-time]");
const chatMessageInput = document.querySelector("#chat-message-input");
const chatMessageSubmit = document.querySelector("#chat-message-submit");
const chatLog = document.querySelector("#chat-log");

// convert utc to local time
messages.forEach((li) => {
  const date = new Date(li.dataset.time);
  const localTime = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  li.insertAdjacentText("afterbegin", `(${localTime}) `);
});

chatMessageInput.focus();
chatMessageInput.onkeyup = function (e) {
  if (e.key === "Enter") {
    // enter, return
    if (chatMessageInput.value.trim()) {
      chatMessageSubmit.click();
    }
  }
};

chatMessageSubmit.onclick = function () {
  const message = chatMessageInput.value.trim();
  chatSocket.send(
    JSON.stringify({
      type: "message",
      data: {
        message: message,
      },
    }),
  );
  chatMessageInput.value = "";
};

chatLog.scrollTop = chatLog.scrollHeight;

// TODO: add some scroll event to count unreads in the front end when viewing older messages
let viewingOldMessages = false;

// SOCKET
const roomName = JSON.parse(document.getElementById("room-name").textContent);

const chatSocket = new WebSocket(
  "ws://" + window.location.host + "/ws/chat/" + roomName + "/",
);

// markRead(); // mark all current messages as read upon joining the room

function handleMessageReceive(e) {
  const data = JSON.parse(e.data);

  let message;
  if (data.user.id === my_id) {
    // Message sent by me
    message = `<li style="color: red;">${data.user.username}: ${data.message}</li>`;
  } else {
    // Message from someone else
    message = `<li>${data.user.username}: ${data.message}</li>`;
  }

  if (!viewingOldMessages) {
    markRead();
  }

  chatLog.innerHTML += message;
  // TODO: when viewing older messages scroll down to the bottom only when you send a message, let the other's message accumulate as unread.
  chatLog.scrollTop = chatLog.scrollHeight;
}

function handleClose(e) {
  console.error("Chat socket closed unexpectedly");
}

function markRead() {
  chatSocket.send(
    JSON.stringify({
      type: "message_read",
      data: {
        // TODO: keeping it here for future
      },
    }),
  );
}

chatSocket.onmessage = handleMessageReceive;
chatSocket.onclose = handleClose;
