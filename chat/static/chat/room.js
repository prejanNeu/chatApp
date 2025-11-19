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

// Intersection Observer to mark messages as read when they become visible
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // If the message is visible, mark it as read
        // We assume the message element has a data-id attribute or similar, 
        // but the current backend `mark_messages_as_read` marks ALL messages for the user in the room.
        // So, if we are at the bottom or viewing new messages, we can just trigger the blanket "mark read".
        // For granular per-message read receipts, the backend would need to accept message IDs.
        // Based on current backend:
        if (!viewingOldMessages) {
          markRead();
        }
      }
    });
  },
  { threshold: 0.5 } // Trigger when 50% of the item is visible
);


chatLog.addEventListener("scroll", () => {
  // Check if user is close to the bottom
  const threshold = 50; // px
  const position = chatLog.scrollTop + chatLog.offsetHeight;
  const height = chatLog.scrollHeight;

  if (position >= height - threshold) {
    viewingOldMessages = false;
    markRead(); // Mark all as read when we hit the bottom
  } else {
    viewingOldMessages = true;
  }
});


function handleMessageReceive(e) {
  const data = JSON.parse(e.data);

  let message;
  if (data.sender.id === my_id) {
    message = `<li style="color: red;">${data.sender.username}: ${data.message}</li>`;
  } else {
    message = `<li>${data.sender.username}: ${data.message}</li>`;
  }

  chatLog.insertAdjacentHTML('beforeend', message);

  const newMsgElement = chatLog.lastElementChild;

  // If we are not viewing old messages (i.e., we are at the bottom), scroll to the new message
  if (!viewingOldMessages) {
    chatLog.scrollTop = chatLog.scrollHeight;
    markRead();
  } else {
    // If we are viewing old messages, maybe show a "New Message" badge?
    // For now, just let it append. It won't be marked read until user scrolls down.
  }
}

function handleClose(e) {
  console.error("Chat socket closed unexpectedly");
}

function markRead() {
  if (chatSocket.readyState === WebSocket.OPEN) {
    chatSocket.send(
      JSON.stringify({
        type: "message_read",
        data: {
          // TODO: keeping it here for future
        },
      }),
    );
  }
}

chatSocket.onmessage = handleMessageReceive;
chatSocket.onclose = handleClose;
