// DOM
const messages = document.querySelectorAll("[data-time]");
const chatMessageInput = document.querySelector("#chat-message-input");
const chatMessageSubmit = document.querySelector("#chat-message-submit");
const messageInputDom = document.querySelector("#chat-message-input");
const chatLog = document.getElementById("chat-log");

// Scroll to bottom on page load (after DOM is rendered)
setTimeout(() => {
  chatLog.scrollTop = chatLog.scrollHeight;
}, 100);

// Convert UTC to local time and check edit window for existing messages
messages.forEach((li) => {
  const date = new Date(li.dataset.time);
  const localTime = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const timeDiv = document.createElement("div");
  timeDiv.className = "message-time";
  timeDiv.textContent = localTime;
  li.appendChild(timeDiv);

  // Check if edit button should be disabled (15-minute window)
  const editBtn = li.querySelector(".btn-edit");
  if (editBtn) {
    const now = new Date();
    const minutesSinceSent = (now - date) / (1000 * 60);
    if (minutesSinceSent > 15) {
      editBtn.disabled = true;
      editBtn.style.opacity = "0.5";
      editBtn.style.cursor = "not-allowed";
      editBtn.title = "Edit window expired (15 min)";
    }
  }
});

const fileNameDisplay = document.querySelector("#file-name-display");
const fileInput = document.querySelector("#chat-file-input");

if (fileInput) {
  fileInput.addEventListener("change", function () {
    if (this.files && this.files.length > 0) {
      fileNameDisplay.textContent = this.files[0].name;
    } else {
      fileNameDisplay.textContent = "";
    }
  });
}

// Group Management Functions
function leaveGroup(roomId) {
  if (confirm("Are you sure you want to leave this group?")) {
    fetch(`/chat/group/${roomId}/leave/`, {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
      },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "ok") {
          window.location.href = "/chat/";
        } else {
          alert(data.error || "Error leaving group");
        }
      });
  }
}

function kickMember(roomId, userId, username) {
  if (confirm(`Are you sure you want to remove ${username} from the group?`)) {
    fetch(`/chat/group/${roomId}/kick/${userId}/`, {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
      },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "ok") {
          // Reload to update list
          location.reload();
        } else {
          alert(data.error || "Error removing member");
        }
      });
  }
}

function transferAdmin(roomId, userId, username) {
  if (
    confirm(
      `Are you sure you want to make ${username} the group admin? You will lose admin privileges.`,
    )
  ) {
    fetch(`/chat/group/${roomId}/transfer/${userId}/`, {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
      },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "ok") {
          location.reload();
        } else {
          alert(data.error || "Error transferring admin");
        }
      });
  }
}

function deleteGroup(roomId) {
  if (
    confirm(
      "Are you sure you want to delete this group? This action cannot be undone.",
    )
  ) {
    fetch(`/chat/group/${roomId}/delete/`, {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
      },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "ok") {
          window.location.href = "/chat/";
        } else {
          alert(data.error || "Error deleting group");
        }
      });
  }
}

chatMessageInput.focus();

let typingTimeout;
chatMessageInput.onkeydown = function (e) {
  // Only trigger for printable characters or Backspace, excluding modifiers
  if (
    e.key !== "Enter" &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.metaKey &&
    (e.key.length === 1 || e.key === "Backspace")
  ) {
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
      chatSocket.send(
        JSON.stringify({
          type: "typing",
          data: {
            is_typing: true,
          },
        }),
      );
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(
          JSON.stringify({
            type: "typing",
            data: {
              is_typing: false,
            },
          }),
        );
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
chatMessageInput.addEventListener("paste", async (e) => {
  const items = e.clipboardData.items;

  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image") !== -1) {
      e.preventDefault(); // Prevent default paste behavior

      const blob = items[i].getAsFile();

      // Create a new File object with a proper name
      const fileName = "pasted-image-" + Date.now() + ".png";
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

  // Stop typing indicator
  if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
    chatSocket.send(
      JSON.stringify({
        type: "typing",
        data: {
          is_typing: false,
        },
      }),
    );
  }

  if (file) {
    // Frontend validation
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_TYPES = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip",
      "application/x-zip-compressed",
      "application/x-rar-compressed",
      "application/x-7z-compressed",
    ];

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      fileNameDisplay.textContent = `❌ File too large (${sizeMB}MB). Max: 10MB`;
      fileNameDisplay.style.color = "#ef4444";
      setTimeout(() => {
        fileNameDisplay.textContent = "";
        fileNameDisplay.style.color = "";
      }, 4000);
      return;
    }

    // Check file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      fileNameDisplay.textContent = `❌ File type not allowed`;
      fileNameDisplay.style.color = "#ef4444";
      setTimeout(() => {
        fileNameDisplay.textContent = "";
        fileNameDisplay.style.color = "";
      }, 4000);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    fetch("/chat/upload/", {
      method: "POST",
      body: formData,
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
      },
    })
      .then((response) => {
        return response.json();
      })
      .then((data) => {
        if (data.file_url) {
          if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
            chatSocket.send(
              JSON.stringify({
                type: "message",
                data: {
                  message: data.file_url,
                  is_file: true,
                },
              }),
            );
          }
          fileInput.value = ""; // Clear input
          fileNameDisplay.textContent = ""; // Clear display
        } else if (data.error) {
          // Show backend error
          fileNameDisplay.textContent = `❌ ${data.error}`;
          fileNameDisplay.style.color = "#ef4444";
          setTimeout(() => {
            fileNameDisplay.textContent = "";
            fileNameDisplay.style.color = "";
          }, 4000);
        }
      })
      .catch((error) => {
        console.error("Error:", error);
        fileNameDisplay.textContent = "❌ Upload failed";
        fileNameDisplay.style.color = "#ef4444";
        setTimeout(() => {
          fileNameDisplay.textContent = "";
          fileNameDisplay.style.color = "";
        }, 4000);
      });
  }

  if (message) {
    // Send via WebSocket - message will appear for everyone (including sender) via broadcast
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
      chatSocket.send(
        JSON.stringify({
          type: "message",
          data: {
            message: message,
            is_file: false,
          },
        }),
      );
    }
    messageInputDom.value = "";
  }
};

function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== "") {
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === name + "=") {
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
// Try to get roomId if available (for group management), otherwise fallback to roomName (though likely unused for non-groups)
let roomId = roomName;
const roomIdElement = document.getElementById("room-id");
if (roomIdElement) {
  roomId = JSON.parse(roomIdElement.textContent);
}

let chatSocket = null;

function connectChatSocket() {
  const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  chatSocket = new WebSocket(
    protocol + window.location.host + "/ws/chat/" + roomName + "/",
  );

  chatSocket.onmessage = handleMessageReceive;

  chatSocket.onclose = function (e) {
    setTimeout(connectChatSocket, 3000);
  };

  chatSocket.onopen = function (e) {};
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
  { threshold: 0.5 }, // Trigger when 50% of the item is visible
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
    .then((response) => response.json())
    .then((data) => {
      if (data.messages.length === 0) {
        allMessagesLoaded = true;
        isLoading = false;
        return;
      }

      data.messages.forEach((msg) => {
        // Safe construction of message element
        const msgDiv = document.createElement("div");
        msgDiv.className = `message ${msg.is_me ? "sent" : "received"}`;

        const contentDiv = document.createElement("div");
        contentDiv.className = "message-content";

        if (msg.is_file) {
          const fileAttachment = document.createElement("div");
          fileAttachment.className = "file-attachment";

          const icon = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
          );
          icon.setAttribute("width", "16");
          icon.setAttribute("height", "16");
          icon.setAttribute("viewBox", "0 0 24 24");
          icon.setAttribute("fill", "none");
          icon.setAttribute("stroke", "currentColor");
          icon.setAttribute("stroke-width", "2");
          icon.setAttribute("stroke-linecap", "round");
          icon.setAttribute("stroke-linejoin", "round");

          if (msg.is_image) {
            // Image icon
            const rect = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "rect",
            );
            rect.setAttribute("x", "3");
            rect.setAttribute("y", "3");
            rect.setAttribute("width", "18");
            rect.setAttribute("height", "18");
            rect.setAttribute("rx", "2");
            rect.setAttribute("ry", "2");
            icon.appendChild(rect);

            const circle = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "circle",
            );
            circle.setAttribute("cx", "8.5");
            circle.setAttribute("cy", "8.5");
            circle.setAttribute("r", "1.5");
            icon.appendChild(circle);

            const polyline = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "polyline",
            );
            polyline.setAttribute("points", "21 15 16 10 5 21");
            icon.appendChild(polyline);
          } else {
            // File icon
            const path = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "path",
            );
            path.setAttribute(
              "d",
              "M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z",
            );
            icon.appendChild(path);

            const polyline = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "polyline",
            );
            polyline.setAttribute("points", "13 2 13 9 20 9");
            icon.appendChild(polyline);
          }

          fileAttachment.appendChild(icon);

          const link = document.createElement("a");
          link.href = msg.content;
          link.target = "_blank";
          link.className = "file-link";
          const filename = msg.content.split("/").pop().substring(0, 40);
          link.textContent = filename;
          fileAttachment.appendChild(link);

          contentDiv.appendChild(fileAttachment);

          if (msg.is_image) {
            const img = document.createElement("img");
            img.src = msg.content;
            img.className = "message-image";
            contentDiv.appendChild(img);
          }
        } else {
          contentDiv.textContent = msg.content;
        }
        msgDiv.appendChild(contentDiv);

        const date = new Date(msg.timestamp);
        const localTime = date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const timeDiv = document.createElement("div");
        timeDiv.className = "message-time";
        timeDiv.textContent = localTime;
        msgDiv.appendChild(timeDiv);

        chatLog.insertAdjacentElement("afterbegin", msgDiv);
      });

      offset += data.messages.length;

      // Maintain scroll position
      chatLog.scrollTop = chatLog.scrollHeight - currentScrollHeight;

      isLoading = false;
    })
    .catch((error) => {
      console.error("Error fetching messages:", error);
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
  console.table(data);

  if (data.event === "user_join" || data.event === "user_leave") {
    // Track recent leave events to prevent duplicates
    if (data.event === "user_leave") {
      const leaveKey = `leave_${data.username}_${Date.now()}`;

      // Check if we've seen this user leave recently (within 2 seconds)
      if (window.recentLeaves) {
        const recentLeave = window.recentLeaves.find(
          (item) =>
            item.username === data.username &&
            Date.now() - item.timestamp < 2000,
        );
        if (recentLeave) {
          return; // Skip duplicate leave message
        }
      } else {
        window.recentLeaves = [];
      }

      // Add to recent leaves
      window.recentLeaves.push({
        username: data.username,
        timestamp: Date.now(),
      });

      // Clean up old entries after 5 seconds
      setTimeout(() => {
        window.recentLeaves = window.recentLeaves.filter(
          (item) => Date.now() - item.timestamp < 5000,
        );
      }, 5000);
    }

    const action = data.event === "user_join" ? "joined" : "left";
    const systemMsg = document.createElement("div");
    systemMsg.style.textAlign = "center";
    systemMsg.style.margin = "10px 0";
    systemMsg.style.color = "var(--text-muted)";
    systemMsg.style.fontSize = "0.8rem";
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
      // Clear any existing timeout
      if (window.typingDisplayTimeout) {
        clearTimeout(window.typingDisplayTimeout);
      }

      if (data.is_typing) {
        // Only update if not already showing
        if (typingIndicator.style.display !== "block") {
          typingIndicator.innerHTML = `
                      <div class="typing-bubble">
                          <div class="typing-dots">
                              <span></span><span></span><span></span>
                          </div>
                      </div>
                  `;
          typingIndicator.style.display = "block";
        }
      } else {
        // Delay hiding to prevent flicker
        window.typingDisplayTimeout = setTimeout(() => {
          typingIndicator.innerHTML = "";
          typingIndicator.style.display = "none";
        }, 300);
      }
    }
    return;
  }

  // Handle message edit event
  if (data.event === "message_edited") {
    const messageDiv = document.querySelector(
      `[data-message-id="${data.message_id}"]`,
    );
    if (messageDiv) {
      const contentDiv = messageDiv.querySelector(".message-content");
      contentDiv.dataset.originalContent = data.content;
      contentDiv.innerHTML = `${data.content} <span class="edited-indicator" title="Edited">(edited)</span>`;
    }
    return;
  }

  // Handle group management updates
  if (data.event === "group_update") {
    if (
      data.event_type === "member_left" ||
      data.event_type === "member_kicked"
    ) {
      // Remove member from list
      const memberItem = document.querySelector(
        `.member-item[data-user-id="${data.user_id}"]`,
      );
      if (memberItem) {
        memberItem.remove();
      }

      // If I am the one kicked
      if (data.user_id === my_id) {
        window.location.href = "/chat/";
      }

      // Handle admin reassignment
      if (data.new_admin_id) {
        updateAdminUI(data.new_admin_id);
      }
    } else if (data.event_type === "admin_transferred") {
      updateAdminUI(data.new_admin_id);
    }
    return;
  }

  // Handle message delete event
  if (data.event === "message_deleted") {
    const messageDiv = document.querySelector(
      `[data-message-id="${data.message_id}"]`,
    );
    if (messageDiv) {
      const contentDiv = messageDiv.querySelector(".message-content");
      contentDiv.innerHTML =
        '<em style="color: var(--text-muted);">Message deleted</em>';

      // Remove edit/delete buttons if they exist
      const actions = messageDiv.querySelector(".message-actions");
      if (actions) {
        actions.remove();
      }

      messageDiv.dataset.isDeleted = "true";
    }
    return;
  }

  const isMe = data.sender.id === my_id;

  const msgClass = isMe ? "sent" : "received";

  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${msgClass}`;
  msgDiv.dataset.time = new Date().toISOString();
  msgDiv.dataset.messageId = data.id;
  msgDiv.dataset.isDeleted = "false";

  // Add sender name for group chats if it's not me
  if (typeof is_group !== "undefined" && is_group && !isMe) {
    const senderNameSpan = document.createElement("span");
    senderNameSpan.className = "message-sender-name";
    // Use full_name if available, otherwise username
    senderNameSpan.textContent = data.sender.full_name || data.sender.username;
    msgDiv.appendChild(senderNameSpan);
  }

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  if (data.is_file) {
    const fileAttachment = document.createElement("div");
    fileAttachment.className = "file-attachment";

    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("width", "16");
    icon.setAttribute("height", "16");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "2");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");

    if (data.message.match(/\.(jpeg|jpg|gif|png)$/) != null) {
      // Image icon
      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      rect.setAttribute("x", "3");
      rect.setAttribute("y", "3");
      rect.setAttribute("width", "18");
      rect.setAttribute("height", "18");
      rect.setAttribute("rx", "2");
      rect.setAttribute("ry", "2");
      icon.appendChild(rect);

      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.setAttribute("cx", "8.5");
      circle.setAttribute("cy", "8.5");
      circle.setAttribute("r", "1.5");
      icon.appendChild(circle);

      const polyline = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "polyline",
      );
      polyline.setAttribute("points", "21 15 16 10 5 21");
      icon.appendChild(polyline);
    } else {
      // File icon
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute(
        "d",
        "M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z",
      );
      icon.appendChild(path);

      const polyline = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "polyline",
      );
      polyline.setAttribute("points", "13 2 13 9 20 9");
      icon.appendChild(polyline);
    }

    fileAttachment.appendChild(icon);

    const link = document.createElement("a");
    link.href = data.message;
    link.target = "_blank";
    link.className = "file-link";
    const filename = data.message.split("/").pop().substring(0, 40);
    link.textContent = filename;
    fileAttachment.appendChild(link);

    contentDiv.appendChild(fileAttachment);

    if (data.message.match(/\.(jpeg|jpg|gif|png)$/) != null) {
      const img = document.createElement("img");
      img.src = data.message;
      img.className = "message-image";
      contentDiv.appendChild(img);
    }
  } else {
    // SAFE: using textContent prevents XSS
    contentDiv.textContent = data.message;
  }

  // Add data attribute for original content
  contentDiv.dataset.originalContent = data.message;

  msgDiv.appendChild(contentDiv);

  // Add edit/delete buttons for own non-file messages
  if (isMe && !data.is_file) {
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "message-actions";

    // Check if message is within 15-minute edit window
    const messageTime = new Date(data.timestamp);
    const now = new Date();
    const minutesSinceSent = (now - messageTime) / (1000 * 60);
    const canEdit = minutesSinceSent <= 15;

    // Edit button
    const editBtn = document.createElement("button");
    editBtn.className = "btn-icon btn-edit";
    editBtn.title = canEdit ? "Edit message" : "Edit window expired (15 min)";
    editBtn.disabled = !canEdit;
    if (!canEdit) {
      editBtn.style.opacity = "0.5";
      editBtn.style.cursor = "not-allowed";
    }
    editBtn.onclick = function () {
      if (canEdit) editMessage(data.id);
    };
    editBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
      `;

    // Delete button (no time limit)
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-icon btn-delete";
    deleteBtn.title = "Delete message";
    deleteBtn.onclick = function () {
      deleteMessage(data.id);
    };
    deleteBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
      `;

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
    msgDiv.appendChild(actionsDiv);
  }

  const timeDiv = document.createElement("div");
  timeDiv.className = "message-time";
  const date = new Date();
  const localTime = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  timeDiv.textContent = localTime;
  msgDiv.appendChild(timeDiv);

  chatLog.appendChild(msgDiv);

  // Remove "No messages yet" text if it exists
  const noMessagesText = document.getElementById("no-messages-text");
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
          data: {},
        }),
      );
    }
    markReadTimeout = null;
  }, 100); // 100ms debounce
}

// Message Management Functions
function editMessage(messageId) {
  const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageDiv) return;

  const contentDiv = messageDiv.querySelector(".message-content");
  const originalContent = contentDiv.dataset.originalContent;

  // Create inline editor
  const editor = document.createElement("div");
  editor.className = "message-editor";
  editor.innerHTML = `
    <textarea class="edit-textarea">${originalContent}</textarea>
    <div class="edit-actions">
      <button class="btn-small btn-primary" onclick="saveEdit(${messageId})">Save</button>
      <button class="btn-small" onclick="cancelEdit(${messageId})">Cancel</button>
    </div>
  `;

  // Replace content with editor
  contentDiv.innerHTML = "";
  contentDiv.appendChild(editor);

  // Focus textarea
  const textarea = editor.querySelector(".edit-textarea");
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function saveEdit(messageId) {
  const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
  const textarea = messageDiv.querySelector(".edit-textarea");
  const newContent = textarea.value.trim();

  if (!newContent) {
    alert("Message cannot be empty");
    return;
  }

  const formData = new FormData();
  formData.append("content", newContent);

  fetch(`/chat/message/${messageId}/edit/`, {
    method: "POST",
    body: formData,
    headers: {
      "X-CSRFToken": getCookie("csrftoken"),
    },
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        // Update message content
        const contentDiv = messageDiv.querySelector(".message-content");
        contentDiv.dataset.originalContent = data.content;
        contentDiv.innerHTML = `${data.content} <span class="edited-indicator" title="Edited">(edited)</span>`;
      } else if (data.error) {
        alert(data.error);
      }
    })
    .catch((error) => {
      console.error("Error editing message:", error);
      alert("Failed to edit message");
    });
}

function cancelEdit(messageId) {
  const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
  const contentDiv = messageDiv.querySelector(".message-content");
  const originalContent = contentDiv.dataset.originalContent;

  // Restore original content
  contentDiv.innerHTML = originalContent;
}

function deleteMessage(messageId) {
  if (!confirm("Are you sure you want to delete this message?")) {
    return;
  }

  fetch(`/chat/message/${messageId}/delete/`, {
    method: "POST",
    headers: {
      "X-CSRFToken": getCookie("csrftoken"),
    },
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        // Update message to show as deleted
        const messageDiv = document.querySelector(
          `[data-message-id="${messageId}"]`,
        );
        const contentDiv = messageDiv.querySelector(".message-content");
        contentDiv.innerHTML =
          '<em style="color: var(--text-muted);">Message deleted</em>';

        // Remove edit/delete buttons
        const actions = messageDiv.querySelector(".message-actions");
        if (actions) {
          actions.remove();
        }

        // Mark as deleted
        messageDiv.dataset.isDeleted = "true";
      } else if (data.error) {
        alert(data.error);
      }
    })
    .catch((error) => {
      console.error("Error deleting message:", error);
      alert("Failed to delete message");
    });
}

function updateAdminUI(newAdminId) {
  // Remove old admin labels
  document.querySelectorAll(".member-role").forEach((el) => el.remove());

  // Add new admin label
  const newAdminItem = document.querySelector(
    `.member-item[data-user-id="${newAdminId}"]`,
  );
  if (newAdminItem) {
    const nameSpan = newAdminItem.querySelector(".member-name");
    const roleSpan = document.createElement("span");
    roleSpan.className = "member-role";
    roleSpan.textContent = "Admin";
    nameSpan.after(roleSpan);
  }

  // Update buttons visibility based on whether I am the new admin
  const amIAdmin = newAdminId === my_id;
  const footer = document.querySelector(".modal-footer");

  // Update delete group button
  const deleteBtn = footer.querySelector(".btn-danger");
  if (amIAdmin) {
    if (!deleteBtn) {
      const btn = document.createElement("button");
      btn.className = "btn btn-danger";
      btn.textContent = "Delete Group";
      btn.onclick = () => deleteGroup(roomId); // Use roomId (UUID)
      footer.appendChild(btn);
    }
  } else {
    if (deleteBtn) {
      deleteBtn.remove();
    }
  }

  // Update member action buttons (kick/transfer)
  document.querySelectorAll(".member-item").forEach((item) => {
    const userId = parseInt(item.dataset.userId);
    const actionsDiv = item.querySelector(".member-actions");

    if (amIAdmin && userId !== my_id) {
      if (!actionsDiv) {
        // Add actions div if not present
        const div = document.createElement("div");
        div.className = "member-actions";
        div.style.cssText = "display: flex; gap: 5px;";

        const username = item.querySelector(".member-name").textContent;

        div.innerHTML = `
                    <button class="btn-small btn-outline" onclick="transferAdmin('${roomId}', ${userId}, '${username}')" title="Make Admin">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                    </button>
                    <button class="btn-small btn-danger-outline" onclick="kickMember('${roomId}', ${userId}, '${username}')" title="Remove Member">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                    </button>
                `;
        item.appendChild(div);
      }
    } else {
      if (actionsDiv) {
        actionsDiv.remove();
      }
    }
  });
}

function addMember(roomId, userId, username) {
  if (confirm(`Add ${username} to this group?`)) {
    fetch(`/chat/group/${roomId}/add/${userId}/`, {
      method: "POST",
      headers: {
        "X-CSRFToken": getCookie("csrftoken"),
      },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "ok") {
          document.getElementById("addMemberModal").style.display = "none";
          location.reload();
        } else {
          alert(data.error || "Error adding member");
        }
      });
  }
}
