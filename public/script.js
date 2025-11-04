const socket = io();
const statusEl = document.getElementById("status");
const qrImg = document.getElementById("qr");
const phoneErrorEl = document.getElementById("phone-error");

document.getElementById("switch-to-phone").onclick = () => {
  document.getElementById("qr-section").style.display = "none";
  document.getElementById("phone-section").style.display = "block";
  document.getElementById("phone").focus();
};

const phoneInput = document.querySelector("#phone");
const iti = window.intlTelInput(phoneInput, {
  separateDialCode: true,
  preferredCountries: ["in", "us", "gb"],
  utilsScript: "https://cdn.jsdelivr.net/npm/intl-tel-input@25.10.10/build/js/utils.js"
});

document.getElementById("send-code").onclick = () => {
  phoneErrorEl.textContent = "";
  let number = phoneInput.value.replace(/\D/g, "");
  let fullNumber = iti.getSelectedCountryData().dialCode ? "+" + iti.getSelectedCountryData().dialCode + number : number;
  
  if (!number) {
    phoneErrorEl.textContent = "Please enter a phone number.";
    return;
  }
  
  console.log("Sending phone to server:", fullNumber);
  socket.emit("request-code", { phone: fullNumber });
  document.getElementById("phone-section").style.display = "none";
  document.getElementById("code-section").style.display = "block";
};

socket.on("qr", qrDataUrl => {
  qrImg.src = qrDataUrl;
  statusEl.textContent = "QR Code ready! Scan with WhatsApp.";
});

socket.on("qr-raw", qr => {
  new QRCode(document.getElementById("qr-container"), {
    text: qr,
    width: 300,
    height: 300,
    correctLevel: QRCode.CorrectLevel.L
  });
  statusEl.textContent = "QR Code ready! Scan with WhatsApp.";
});

socket.on("pairing-code", code => {
  const container = document.getElementById("pairing-code");
  container.innerHTML = "";
  code.split("-").forEach((group, i, arr) => {
    for (const char of group) {
      const el = document.createElement("span");
      el.className = "pairing-char";
      el.textContent = char;
      container.appendChild(el);
    }
    if (i !== arr.length - 1) {
      const spacer = document.createElement("span");
      spacer.style.width = "12px";
      container.appendChild(spacer);
    }
  });
});

socket.on("qr-error", () => {
  statusEl.textContent = "Failed to create QR. Try reload.";
});

socket.on("pairing-error", e => {
  const container = document.getElementById("pairing-code");
  container.innerHTML = "";
  const errorSpan = document.createElement("span");
  errorSpan.textContent = "Error: " + e;
  errorSpan.style.color = "#c00";
  errorSpan.style.fontWeight = "bold";
  container.appendChild(errorSpan);
});

socket.on("login-success", () => {
  document.body.innerHTML = "<div style='display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;'><h1>Successfully Logged in!</h1><p>Window will close in 5 seconds...</p></div>";
  setTimeout(() => window.close(), 5000);
});
