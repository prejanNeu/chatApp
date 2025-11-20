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

const fileNameDisplay = document.querySelector("#file-name-display");
const fileInput = document.querySelector("#chat-file-input");

fileInput.onchange = function() {
    if (fileInput.files.length > 0) {
        fileNameDisplay.textContent = fileInput.files[0].name;
    } else {
        fileNameDisplay.textContent = "";
    }
};

chatMessageInput.focus();
chatMessageInput.onkeyup = function (e) {
  if (e.key === "Enter") {
    // enter, return
    // Allow sending if text is present OR if a file is selected
    if (chatMessageInput.value.trim() || fileInput.files.length > 0) {
      chatMessageSubmit.click();
    }
  }
};

chatMessageSubmit.onclick = function () {
  const messageInputDom = document.querySelector("#chat-message-input");
  const message = messageInputDom.value;
  const file = fileInput.files[0];

  console.log("Send clicked. Message:", message, "File:", file);

  if (file) {
    const formData = new FormData();
    formData.append('file', file);

    fetch('/chat/upload/', {
      method: 'POST',
      body: formData,
      headers: {
        'X-CSRFToken': getCookie('csrftoken')
      }
    })
      .then(response => {
          console.log("Upload response status:", response.status);
          return response.json();
      })
      .then(data => {
        console.log("Upload data:", data);
        if (data.file_url) {
          chatSocket.send(JSON.stringify({
            'type': 'message',
            'data': {
              'message': data.file_url,
              'is_file': true
            }
          }));
          fileInput.value = ''; // Clear input
          fileNameDisplay.textContent = ""; // Clear display
        } else {
            console.error("Upload failed:", data);
        }
      })
      .catch(error => console.error('Error:', error));
  }

  if (message) {
    chatSocket.send(JSON.stringify({
      'type': 'message',
      'data': {
        'message': message,
        'is_file': false
      }
    }));
    messageInputDom.value = '';
  }
};

function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === (name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

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


// Pagination
let offset = 20; // Initial offset (we load 20 messages by default)
let isLoading = false;
let allMessagesLoaded = false;

function fetchMessages() {
    if (isLoading || allMessagesLoaded) return;
    isLoading = true;

    const currentScrollHeight = chatLog.scrollHeight;

    fetch(`/chat/messages/${roomName}/?offset=${offset}`)
        .then(response => response.json())
        .then(data => {
            if (data.messages.length === 0) {
                allMessagesLoaded = true;
                isLoading = false;
                return;
            }

            data.messages.forEach(msg => {
                let messageContent = msg.content;
                if (msg.is_file) {
                    messageContent = `<a href="${msg.content}" target="_blank" style="color: inherit; text-decoration: underline;">File Attachment</a>`;
                    if (msg.is_image) {
                        messageContent += `<br><img src="${msg.content}" style="max-width: 200px; max-height: 200px; border-radius: 8px; margin-top: 5px;">`;
                    }
                }

                const msgClass = msg.is_me ? 'sent' : 'received';
                const date = new Date(msg.timestamp);
                const localTime = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                const messageHtml = `
                    <div class="message ${msgClass}">
                        <div class="message-sender">${msg.sender}</div>
                        <div class="message-content">${messageContent}</div>
                        <div class="message-time">(${localTime})</div>
                    </div>
                `;
                chatLog.insertAdjacentHTML('afterbegin', messageHtml);
            });

            offset += data.messages.length;
            
            // Maintain scroll position
            chatLog.scrollTop = chatLog.scrollHeight - currentScrollHeight;
            
            isLoading = false;
        })
        .catch(error => {
            console.error('Error fetching messages:', error);
            isLoading = false;
        });
}

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

  // Pagination: Check if user is at the top
  if (chatLog.scrollTop === 0) {
      fetchMessages();
  }
});


function handleMessageReceive(e) {
  const data = JSON.parse(e.data);

  let messageContent = data.message;
  if (data.is_file) {
    messageContent = `<a href="${data.message}" target="_blank" style="color: inherit; text-decoration: underline;">File Attachment</a>`;
    if (data.message.match(/\.(jpeg|jpg|gif|png)$/) != null) {
      messageContent += `<br><img src="${data.message}" style="max-width: 200px; max-height: 200px; border-radius: 8px; margin-top: 5px;">`;
    }
  }

  const isMe = data.sender.id === my_id;
  const msgClass = isMe ? 'sent' : 'received';

  const messageHtml = `
    <div class="message ${msgClass}">
        <div class="message-sender">${data.sender.username}</div>
        <div class="message-content">${messageContent}</div>
        <div class="message-time">Just now</div>
    </div>
  `;

  chatLog.insertAdjacentHTML('beforeend', messageHtml);

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
