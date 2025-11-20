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

let typingTimeout;
chatMessageInput.onkeydown = function(e) {
    // Only trigger for printable characters or Backspace, excluding modifiers
    if (e.key !== "Enter" && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key.length === 1 || e.key === "Backspace")) {
        if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
            chatSocket.send(JSON.stringify({
                'type': 'typing',
                'data': {
                    'is_typing': true
                }
            }));
        }
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
                chatSocket.send(JSON.stringify({
                    'type': 'typing',
                    'data': {
                        'is_typing': false
                    }
                }));
            }
        }, 1000);
    }
};

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
          if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
              chatSocket.send(JSON.stringify({
                'type': 'message',
                'data': {
                  'message': data.file_url,
                  'is_file': true
                }
              }));
          }
          fileInput.value = ''; // Clear input
          fileNameDisplay.textContent = ""; // Clear display
        } else {
            console.error("Upload failed:", data);
        }
      })
      .catch(error => console.error('Error:', error));
  }

  if (message) {
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(JSON.stringify({
          'type': 'message',
          'data': {
            'message': message,
            'is_file': false
          }
        }));
    }
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
let chatSocket = null;

function connectChatSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    chatSocket = new WebSocket(
        protocol + window.location.host + "/ws/chat/" + roomName + "/",
    );

    chatSocket.onmessage = handleMessageReceive;
    
    chatSocket.onclose = function(e) {
        console.error("Chat socket closed unexpectedly. Reconnecting in 3 seconds...");
        setTimeout(connectChatSocket, 3000);
    };

    chatSocket.onopen = function(e) {
        console.log("Chat socket connected");
    };
}

connectChatSocket();


// Intersection Observer to mark messages as read when they become visible
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
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
                // Safe construction of message element
                const msgDiv = document.createElement('div');
                msgDiv.className = `message ${msg.is_me ? 'sent' : 'received'}`;
                
                const senderDiv = document.createElement('div');
                senderDiv.className = 'message-sender';
                senderDiv.textContent = msg.sender;
                msgDiv.appendChild(senderDiv);

                const contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                
                if (msg.is_file) {
                    const link = document.createElement('a');
                    link.href = msg.content;
                    link.target = '_blank';
                    link.style.color = 'inherit';
                    link.style.textDecoration = 'underline';
                    link.textContent = 'File Attachment';
                    contentDiv.appendChild(link);
                    
                    if (msg.is_image) {
                        contentDiv.appendChild(document.createElement('br'));
                        const img = document.createElement('img');
                        img.src = msg.content;
                        img.style.maxWidth = '200px';
                        img.style.maxHeight = '200px';
                        img.style.borderRadius = '8px';
                        img.style.marginTop = '5px';
                        contentDiv.appendChild(img);
                    }
                } else {
                    contentDiv.textContent = msg.content;
                }
                msgDiv.appendChild(contentDiv);

                const date = new Date(msg.timestamp);
                const localTime = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const timeDiv = document.createElement('div');
                timeDiv.className = 'message-time';
                timeDiv.textContent = `(${localTime})`;
                msgDiv.appendChild(timeDiv);

                chatLog.insertAdjacentElement('afterbegin', msgDiv);
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

  if (data.event === "user_join" || data.event === "user_leave") {
      const action = data.event === "user_join" ? "joined" : "left";
      const systemMsg = document.createElement('div');
      systemMsg.style.textAlign = 'center';
      systemMsg.style.margin = '10px 0';
      systemMsg.style.color = 'var(--text-muted)';
      systemMsg.style.fontSize = '0.8rem';
      systemMsg.textContent = `${data.username} ${action} the chat`;
      
      chatLog.appendChild(systemMsg);
      
      if (!viewingOldMessages) {
          chatLog.scrollTop = chatLog.scrollHeight;
      }
      return;
  }

  if (data.event === "typing") {
      if (data.username === current_username) return; // Ignore own typing
      
      const typingIndicator = document.getElementById("typing-indicator");
      if (data.is_typing) {
          typingIndicator.textContent = `${data.username} is typing...`;
      } else {
          typingIndicator.textContent = "";
      }
      return;
  }

  const isMe = data.sender.id === my_id;
  const msgClass = isMe ? 'sent' : 'received';

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${msgClass}`;

  const senderDiv = document.createElement('div');
  senderDiv.className = 'message-sender';
  senderDiv.textContent = data.sender.username;
  msgDiv.appendChild(senderDiv);

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  if (data.is_file) {
      const link = document.createElement('a');
      link.href = data.message;
      link.target = '_blank';
      link.style.color = 'inherit';
      link.style.textDecoration = 'underline';
      link.textContent = 'File Attachment';
      contentDiv.appendChild(link);

      if (data.message.match(/\.(jpeg|jpg|gif|png)$/) != null) {
          contentDiv.appendChild(document.createElement('br'));
          const img = document.createElement('img');
          img.src = data.message;
          img.style.maxWidth = '200px';
          img.style.maxHeight = '200px';
          img.style.borderRadius = '8px';
          img.style.marginTop = '5px';
          contentDiv.appendChild(img);
      }
  } else {
      // SAFE: using textContent prevents XSS
      contentDiv.textContent = data.message;
  }
  msgDiv.appendChild(contentDiv);

  const timeDiv = document.createElement('div');
  timeDiv.className = 'message-time';
  timeDiv.textContent = 'Just now';
  msgDiv.appendChild(timeDiv);

  chatLog.appendChild(msgDiv);

  // If we are not viewing old messages (i.e., we are at the bottom), scroll to the new message
  if (!viewingOldMessages) {
    chatLog.scrollTop = chatLog.scrollHeight;
    markRead();
  } else {
    // If we are viewing old messages, maybe show a "New Message" badge?
    // For now, just let it append. It won't be marked read until user scrolls down.
  }
}

function markRead() {
  if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
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
