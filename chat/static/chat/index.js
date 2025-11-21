// hide badge when there's no message
document.querySelectorAll(".unread-badge").forEach((badge) => {
  if (parseInt(badge.innerText) === 0) {
    badge.style.display = "none";
  }
});

/**
 * Show a toast notification
 * @param {string} type - 'success', 'error', 'warning', or 'info'
 * @param {string} message - The message to display
 */
function showToast(type, message) {
  const container =
    document.querySelector(".messages-container") || createToastContainer();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  // Icon based on type
  let icon = "";
  if (type === "success") {
    icon =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
  } else if (type === "error") {
    icon =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
  } else if (type === "warning") {
    icon =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
  } else {
    icon =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
  }

  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-content">${message}</div>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;

  container.appendChild(toast);

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    toast.style.transition = "opacity 0.3s";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function createToastContainer() {
  const container = document.createElement("div");
  container.className = "messages-container";
  document
    .querySelector(".main-container")
    .insertBefore(
      container,
      document.querySelector(".main-container").firstChild,
    );
  return container;
}

// Global Notification Socket
let notificationSocket = null;

function connectNotificationSocket() {
  if (typeof current_username === "undefined") {
    // This might happen on pages where the user is not logged in or context is missing
    return;
  }

  const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
  notificationSocket = new WebSocket(
    protocol + window.location.host + "/ws/notifications/",
  );

  notificationSocket.onmessage = function (e) {
    const data = JSON.parse(e.data);

    if (data.event === "new_message") {
      // Update last message
      const lastMessage = document.getElementById(
        `last-message-${data.room_id}`,
      );
      if (lastMessage) {
        // Check if this is a group chat by looking at the room item
        const roomItem = lastMessage.closest(".room-item");
        const isGroup =
          roomItem && roomItem.querySelector(".group-avatar") !== null;

        let prefix = "";
        if (data.from_user_id === current_user_id) {
          prefix = "You: ";
        } else if (isGroup) {
          // Show sender name for group chats
          prefix = data.from_full_name + ": ";
        }

        let content = data.content;

        // Check if it's a file attachment
        if (data.is_file) {
          if (data.is_image) {
            content =
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>Sent an image';
          } else {
            content =
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>Sent a file';
          }
          lastMessage.innerHTML = prefix + content;
        } else {
          if (content.length > 30) {
            content = content.substring(0, 30) + "...";
          }
          lastMessage.textContent = prefix + content;
        }
      }

      // Only increment badge if the message is NOT from the current user
      if (data.from !== current_username) {
        // Update room badge if it exists
        const badge = document.getElementById(`unread-badge-${data.room_id}`);
        if (badge) {
          let count = parseInt(badge.innerText) || 0;
          badge.innerText = count + 1;
          badge.style.display = "inline";
        }

        // Update global badge
        const globalBadge = document.getElementById("global-unread-badge");
        if (globalBadge) {
          let globalCount = parseInt(globalBadge.innerText) || 0;
          globalBadge.innerText = globalCount + 1;
          globalBadge.style.display = "inline-block";
        }
      }
    }
    // Handle being kicked or group deleted
    else if (
      data.event === "kicked_from_group" ||
      data.event === "group_deleted"
    ) {
      // Show toast notification
      if (data.event === "kicked_from_group") {
        showToast("warning", `You were removed from "${data.room_name}"`);
      } else {
        showToast("info", `Group "${data.room_name}" was deleted`);
      }

      // If currently in the room, redirect to index
      if (window.location.pathname.includes(data.room_id)) {
        setTimeout(() => {
          window.location.href = "/chat/";
        }, 1000); // Delay to show toast
      } else {
        // Otherwise just remove the room from sidebar
        const roomItem = document.getElementById(`room-${data.room_id}`);
        if (roomItem) {
          roomItem.remove();
        }
      }
    }
    // Handle being added to group
    else if (data.event === "added_to_group") {
      showToast(
        "success",
        `You were added to "${data.room_name}" by ${data.added_by}`,
      );
      setTimeout(() => location.reload(), 1500);
    }
    // Handle admin transferred
    else if (data.event === "admin_transferred") {
      showToast("success", `You are now admin of "${data.room_name}"`);
      if (window.location.pathname.includes(data.room_id)) {
        setTimeout(() => location.reload(), 1500);
      }
    }
    // Handle message edit/delete updates in sidebar
    else if (data.event === "message_updated") {
      const lastMessage = document.getElementById(
        `last-message-${data.room_id}`,
      );
      if (lastMessage) {
        // Check if this is a group chat
        const roomItem = lastMessage.closest(".room-item");
        const isGroup =
          roomItem && roomItem.querySelector(".group-avatar") !== null;

        let prefix = "";
        if (data.from_user_id === current_user_id) {
          prefix = "You ";
        } else if (isGroup) {
          prefix = `${data.from_full_name} `;
        }

        let content = data.content;
        lastMessage.textContent = prefix + content;
      }
    }
    // Friend request events
    else if (data.event === "friend_request_received") {
      // Increment friend request badge
      updateFriendRequestBadge(1);
    } else if (data.event === "friend_request_cancelled") {
      // Decrement friend request badge when sender cancels
      updateFriendRequestBadge(-1);
    } else if (
      data.event === "friend_request_accepted" ||
      data.event === "friend_request_rejected"
    ) {
      // TODO:
      // These don't affect the current user's incoming request count
      // But we could show a toast notification if desired
    } else if (data.event === "unread_cleared") {
      // Update room badge if it exists
      const badge = document.getElementById(`unread-badge-${data.room_id}`);
      if (badge) {
        let clearedCount = parseInt(badge.innerText) || 0;
        badge.innerText = 0;
        badge.style.display = "none";

        // Update global badge
        const globalBadgeCleared = document.getElementById(
          "global-unread-badge",
        );
        if (globalBadgeCleared) {
          let globalCount = parseInt(globalBadgeCleared.innerText) || 0;
          // We don't know exactly how many were cleared, but usually we clear all for that room.
          // A simple decrement might be wrong if multiple messages were unread.
          // Ideally, the backend sends the new total unread count.
          // For now, we might just decrement by the amount that was in the room badge?
          // Or better, fetch the new total count.
          // But for simplicity, let's just subtract the cleared amount if we knew it.
          // Since we don't, we might just leave it or fetch.
          // Let's try to just subtract the cleared count from the global badge
          if (clearedCount > 0) {
            let newGlobal = globalCount - clearedCount;
            if (newGlobal < 0) newGlobal = 0;
            globalBadgeCleared.innerText = newGlobal;
            if (newGlobal === 0) {
              globalBadgeCleared.style.display = "none";
            }
          }
        }
      }
    } else if (data.event === "status_change") {
      const statusDot = document.getElementById(`status-dot-${data.user_id}`);
      if (statusDot) {
        if (data.is_online) {
          statusDot.classList.remove("offline");
          statusDot.classList.add("online");
        } else {
          statusDot.classList.remove("online");
          statusDot.classList.add("offline");
        }
      }
    } else if (data.event === "group_created") {
      // Reload page to show new group in sidebar
      // TODO: Implement dynamic sidebar insertion
      location.reload();
    }
  };

  notificationSocket.onclose = function (e) {
    setTimeout(connectNotificationSocket, 3000);
  };

  notificationSocket.onopen = function (e) {};
}

// Helper function to get CSRF cookie
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

// Helper function to update friend request badge
function updateFriendRequestBadge(delta) {
  // Update navbar badge(s)
  // Use querySelectorAll to handle potential duplicates or mobile/desktop versions
  let navbarBadges = document.querySelectorAll(
    '.nav-link[href*="friends"] .unread-badge',
  );

  // If no badges found, try to create one on the first matching link
  if (navbarBadges.length === 0) {
    const friendsLink = document.querySelector('.nav-link[href*="friends"]');
    if (friendsLink) {
      const newBadge = document.createElement("span");
      newBadge.className = "unread-badge";
      newBadge.style.marginLeft = "5px";
      newBadge.style.display = "none"; // Start hidden
      newBadge.textContent = "0"; // Initialize with 0
      friendsLink.appendChild(newBadge);

      navbarBadges = [newBadge];
    }
  }

  navbarBadges.forEach((badge) => {
    let currentCount = parseInt(badge.textContent) || 0;
    currentCount += delta;
    if (currentCount < 0) currentCount = 0; // Prevent negative counts

    // ALWAYS update text content, even if hidden
    badge.textContent = currentCount;

    if (currentCount > 0) {
      badge.style.display = "inline";
    } else {
      badge.style.display = "none";
    }
  });

  // Update sidebar badge
  let sidebarBadge = document.querySelector(
    '.room-item[onclick*="friend_requests"] .unread-badge',
  );

  if (!sidebarBadge) {
    // Create badge if it doesn't exist
    const friendRequestsItem = document.querySelector(
      '.room-item[onclick*="friend_requests"]',
    );
    if (friendRequestsItem) {
      sidebarBadge = document.createElement("span");
      sidebarBadge.className = "unread-badge";
      sidebarBadge.style.display = "none";
      sidebarBadge.textContent = "0";
      friendRequestsItem.appendChild(sidebarBadge);
    }
  }

  if (sidebarBadge) {
    let currentCount = parseInt(sidebarBadge.textContent) || 0;
    currentCount += delta;
    if (currentCount < 0) currentCount = 0;

    // ALWAYS update text content
    sidebarBadge.textContent = currentCount;

    if (currentCount > 0) {
      sidebarBadge.style.display = "inline";
    } else {
      sidebarBadge.style.display = "none";
    }
  }
}

document.addEventListener("DOMContentLoaded", function () {
  connectNotificationSocket();

  // Theme Toggle Logic
  const themeToggle = document.getElementById("theme-toggle");
  const moonIcon = document.getElementById("theme-icon-moon");
  const sunIcon = document.getElementById("theme-icon-sun");
  const body = document.body;
  const savedTheme = localStorage.getItem("theme");

  // Apply saved theme on load
  if (savedTheme === "dark") {
    body.setAttribute("data-theme", "dark");
    if (moonIcon && sunIcon) {
      moonIcon.style.display = "none";
      sunIcon.style.display = "block";
    }
  } else if (savedTheme === "light") {
    body.setAttribute("data-theme", "light");
    if (moonIcon && sunIcon) {
      moonIcon.style.display = "block";
      sunIcon.style.display = "none";
    }
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      if (body.getAttribute("data-theme") === "dark") {
        body.setAttribute("data-theme", "light");
        localStorage.setItem("theme", "light");
        if (moonIcon && sunIcon) {
          moonIcon.style.display = "block";
          sunIcon.style.display = "none";
        }
      } else {
        body.setAttribute("data-theme", "dark");
        localStorage.setItem("theme", "dark");
        if (moonIcon && sunIcon) {
          moonIcon.style.display = "none";
          sunIcon.style.display = "block";
        }
      }
    });
  }

  // Auto-dismiss Django messages/toasts after 5 seconds
  document.querySelectorAll(".toast").forEach((msg) => {
    setTimeout(() => {
      msg.style.transition = "opacity 0.3s";
      msg.style.opacity = "0";
      setTimeout(() => msg.remove(), 300);
    }, 5000);
  });

  // Sidebar Toggle Logic
  const hamburger = document.querySelector("#menu-toggle");
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.querySelector(".overlay");

  if (hamburger && sidebar && overlay) {
    hamburger.addEventListener("click", () => {
      sidebar.classList.toggle("active");
      overlay.classList.toggle("active");
    });

    overlay.addEventListener("click", () => {
      sidebar.classList.remove("active");
      overlay.classList.remove("active");
    });
  }

  // Handle sidebar room clicks (replaced inline onclick)
  document.querySelectorAll(".room-item[data-url]").forEach((item) => {
    item.addEventListener("click", function () {
      window.location.href = this.dataset.url;
    });
  });

  // User menu dropdown
  const userMenu = document.querySelector(".user-menu");
  const userMenuTrigger = document.querySelector(".user-menu-trigger");

  if (userMenuTrigger && userMenu) {
    userMenuTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      userMenu.classList.toggle("active");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!userMenu.contains(e.target)) {
        userMenu.classList.remove("active");
      }
    });
  }
});
