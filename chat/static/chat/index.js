// hide badge when there's no message
document.querySelectorAll(".unread-badge").forEach((badge) => {
  if (parseInt(badge.innerText) === 0) {
    badge.style.display = "none";
  }
});

// Global Notification Socket
let notificationSocket = null;

function connectNotificationSocket() {
    if (typeof current_username === 'undefined') {
        // This might happen on pages where the user is not logged in or context is missing
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    notificationSocket = new WebSocket(
        protocol + window.location.host + "/ws/notifications/"
    );

    notificationSocket.onmessage = function(e) {
        const data = JSON.parse(e.data);
        console.log("Notification received:", data);

        if (data.event === "new_message") {
            // Update last message
            const lastMessage = document.getElementById(`last-message-${data.room_id}`);
            if (lastMessage) {
                let prefix = "";
                if (typeof current_username !== 'undefined' && data.from === current_username) {
                    prefix = "You: ";
                }
                
                let content = data.content;
                if (content.length > 30) {
                    content = content.substring(0, 30) + "...";
                }
                lastMessage.innerText = prefix + content;
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
        } else if (data.event === "unread_cleared") {
             // Update room badge if it exists
            const badge = document.getElementById(`unread-badge-${data.room_id}`);
            if (badge) {
              let clearedCount = parseInt(badge.innerText) || 0;
              badge.innerText = 0; 
              badge.style.display = "none";

              // Update global badge
              const globalBadgeCleared = document.getElementById("global-unread-badge");
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
                    statusDot.classList.remove('offline');
                    statusDot.classList.add('online');
                } else {
                    statusDot.classList.remove('online');
                    statusDot.classList.add('offline');
                }
            }
        }
    };

    notificationSocket.onclose = function(e) {
        console.error("Notification socket closed unexpectedly. Reconnecting in 3 seconds...");
        setTimeout(connectNotificationSocket, 3000);
    };
    
    notificationSocket.onopen = function(e) {
        console.log("Notification socket connected");
    };
}

document.addEventListener("DOMContentLoaded", function () {
    connectNotificationSocket();

    // Sidebar Toggle Logic
    const hamburger = document.querySelector(".hamburger");
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
    document.querySelectorAll('.room-item[data-url]').forEach(item => {
        item.addEventListener('click', function() {
            window.location.href = this.dataset.url;
        });
    });
});
