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
  const timeDiv = document.createElement('div');
  timeDiv.className = 'message-time';
  timeDiv.textContent = localTime;
  li.appendChild(timeDiv);
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

// Paste image support
chatMessageInput.addEventListener('paste', async (e) => {
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault(); // Prevent default paste behavior
            
            const blob = items[i].getAsFile();
            
            // Create a new File object with a proper name
            const fileName = 'pasted-image-' + Date.now() + '.png';
            const file = new File([blob], fileName, { type: blob.type });
            
            // Create a DataTransfer object to set the file input
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;
            
            // Show file name
            fileNameDisplay.textContent = `📷 ${fileName}`;
            
            // Focus back on input so user can add a message
            chatMessageInput.focus();
            
            break; // Only handle first image
        }
    }
});

chatMessageSubmit.onclick = function () {
  const messageInputDom = document.querySelector("#chat-message-input");
  const message = messageInputDom.value;
  const file = fileInput.files[0];



  if (file) {
    // Frontend validation
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_TYPES = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip', 'application/x-zip-compressed',
      'application/x-rar-compressed', 'application/x-7z-compressed'
    ];

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      fileNameDisplay.textContent = `❌ File too large (${sizeMB}MB). Max: 10MB`;
      fileNameDisplay.style.color = '#ef4444';
      setTimeout(() => {
        fileNameDisplay.textContent = "";
        fileNameDisplay.style.color = "";
      }, 4000);
      return;
    }

    // Check file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      fileNameDisplay.textContent = `❌ File type not allowed`;
      fileNameDisplay.style.color = '#ef4444';
      setTimeout(() => {
        fileNameDisplay.textContent = "";
        fileNameDisplay.style.color = "";
      }, 4000);
      return;
    }

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

          return response.json();
      })
      .then(data => {

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
        } else if (data.error) {
            // Show backend error
            fileNameDisplay.textContent = `❌ ${data.error}`;
            fileNameDisplay.style.color = '#ef4444';
            setTimeout(() => {
              fileNameDisplay.textContent = "";
              fileNameDisplay.style.color = "";
            }, 4000);
        }
      })
      .catch(error => {
        console.error('Error:', error);
        fileNameDisplay.textContent = "❌ Upload failed";
        fileNameDisplay.style.color = '#ef4444';
        setTimeout(() => {
          fileNameDisplay.textContent = "";
          fileNameDisplay.style.color = "";
        }, 4000);
      });
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


let viewingOldMessages = false;
let markReadTimeout = null;

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

        setTimeout(connectChatSocket, 3000);
    };

    chatSocket.onopen = function(e) {

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

                const contentDiv = document.createElement('div');
                contentDiv.className = 'message-content';
                
                if (msg.is_file) {
                    const fileAttachment = document.createElement('div');
                    fileAttachment.className = 'file-attachment';
                    
                    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    icon.setAttribute('width', '16');
                    icon.setAttribute('height', '16');
                    icon.setAttribute('viewBox', '0 0 24 24');
                    icon.setAttribute('fill', 'none');
                    icon.setAttribute('stroke', 'currentColor');
                    icon.setAttribute('stroke-width', '2');
                    icon.setAttribute('stroke-linecap', 'round');
                    icon.setAttribute('stroke-linejoin', 'round');
                    
                    if (msg.is_image) {
                        // Image icon
                        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        rect.setAttribute('x', '3');
                        rect.setAttribute('y', '3');
                        rect.setAttribute('width', '18');
                        rect.setAttribute('height', '18');
                        rect.setAttribute('rx', '2');
                        rect.setAttribute('ry', '2');
                        icon.appendChild(rect);
                        
                        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        circle.setAttribute('cx', '8.5');
                        circle.setAttribute('cy', '8.5');
                        circle.setAttribute('r', '1.5');
                        icon.appendChild(circle);
                        
                        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                        polyline.setAttribute('points', '21 15 16 10 5 21');
                        icon.appendChild(polyline);
                    } else {
                        // File icon
                        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        path.setAttribute('d', 'M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z');
                        icon.appendChild(path);
                        
                        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                        polyline.setAttribute('points', '13 2 13 9 20 9');
                        icon.appendChild(polyline);
                    }
                    
                    fileAttachment.appendChild(icon);
                    
                    const link = document.createElement('a');
                    link.href = msg.content;
                    link.target = '_blank';
                    link.className = 'file-link';
                    const filename = msg.content.split('/').pop().substring(0, 40);
                    link.textContent = filename;
                    fileAttachment.appendChild(link);
                    
                    contentDiv.appendChild(fileAttachment);
                    
                    if (msg.is_image) {
                        const img = document.createElement('img');
                        img.src = msg.content;
                        img.className = 'message-image';
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
                timeDiv.textContent = localTime;
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
      
      if (typingIndicator) {
          if (data.is_typing) {
              typingIndicator.textContent = `${data.username} is typing...`;
              typingIndicator.style.display = "block";
          } else {
              typingIndicator.textContent = "";
              typingIndicator.style.display = "none";
          }
      }
      return;
  }

  const isMe = data.sender.id === my_id;
  const msgClass = isMe ? 'sent' : 'received';

  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${msgClass}`;

  // Add sender name for group chats if it's not me
  if (typeof is_group !== 'undefined' && is_group && !isMe) {
      const senderNameSpan = document.createElement('span');
      senderNameSpan.className = 'message-sender-name';
      // Use full_name if available, otherwise username
      senderNameSpan.textContent = data.sender.full_name || data.sender.username;
      msgDiv.appendChild(senderNameSpan);
  }

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  if (data.is_file) {
      const fileAttachment = document.createElement('div');
      fileAttachment.className = 'file-attachment';
      
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('width', '16');
      icon.setAttribute('height', '16');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('stroke-width', '2');
      icon.setAttribute('stroke-linecap', 'round');
      icon.setAttribute('stroke-linejoin', 'round');
      
      if (data.message.match(/\.(jpeg|jpg|gif|png)$/) != null) {
          // Image icon
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.setAttribute('x', '3');
          rect.setAttribute('y', '3');
          rect.setAttribute('width', '18');
          rect.setAttribute('height', '18');
          rect.setAttribute('rx', '2');
          rect.setAttribute('ry', '2');
          icon.appendChild(rect);
          
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', '8.5');
          circle.setAttribute('cy', '8.5');
          circle.setAttribute('r', '1.5');
          icon.appendChild(circle);
          
          const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          polyline.setAttribute('points', '21 15 16 10 5 21');
          icon.appendChild(polyline);
      } else {
          // File icon
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', 'M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z');
          icon.appendChild(path);
          
          const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          polyline.setAttribute('points', '13 2 13 9 20 9');
          icon.appendChild(polyline);
      }
      
      fileAttachment.appendChild(icon);
      
      const link = document.createElement('a');
      link.href = data.message;
      link.target = '_blank';
      link.className = 'file-link';
      const filename = data.message.split('/').pop().substring(0, 40);
      link.textContent = filename;
      fileAttachment.appendChild(link);
      
      contentDiv.appendChild(fileAttachment);

      if (data.message.match(/\.(jpeg|jpg|gif|png)$/) != null) {
          const img = document.createElement('img');
          img.src = data.message;
          img.className = 'message-image';
          contentDiv.appendChild(img);
      }
  } else {
      // SAFE: using textContent prevents XSS
      contentDiv.textContent = data.message;
  }
  msgDiv.appendChild(contentDiv);

  const timeDiv = document.createElement('div');
  timeDiv.className = 'message-time';
  const date = new Date();
  const localTime = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  timeDiv.textContent = localTime;
  msgDiv.appendChild(timeDiv);

  chatLog.appendChild(msgDiv);

  // Remove "No messages yet" text if it exists
  const noMessagesText = document.getElementById('no-messages-text');
  if (noMessagesText) {
    noMessagesText.remove();
  }

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
  // Debounce to prevent duplicate calls
  if (markReadTimeout) {
    clearTimeout(markReadTimeout);
  }
  
  markReadTimeout = setTimeout(() => {
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
      chatSocket.send(
        JSON.stringify({
          type: "message_read",
          data: {

          },
        }),
      );
    }
    markReadTimeout = null;
  }, 100); // 100ms debounce
}
