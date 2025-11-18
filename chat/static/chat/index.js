// hide badge when there's no message
document.querySelectorAll(".unread-badge").forEach((badge) => {
  if (parseInt(badge.innerText) === 0) {
    badge.style.display = "none";
  }
});

document.addEventListener("DOMContentLoaded", function () {
  const notificationSocket = new WebSocket(
    "ws://" + window.location.host + "/ws/notifications/",
  );

  notificationSocket.onmessage = function (e) {
    const data = JSON.parse(e.data);

    const roomId = data.room_id;
    const badge = document.querySelector(
      `[data-room="${roomId}"] .unread-badge`,
    );

    const last_message = document.querySelector(
      `[data-room="${roomId}"] .last-message`,
    );

    switch (data.event) {
      case "new_message":
        if (badge) {
          let count = parseInt(badge.innerText) || 0;
          badge.innerText = count + 1;
          badge.style.display = "inline";
        }
        last_message.innerText = `- ${data.content}`;
        break;
      case "unread_cleared":
        console.log("New message:", data);
        if (badge) {
          badge.innerText = 0; // to avoid parsing errors in future messages
          badge.style.display = "none";
        }
        break;
      default:
        console.error("Unknown Notification Type");
    }
  };
});
