// Smoke-only bootstrap. Later tasks replace this with the real app loop.
const canvas = document.getElementById("tunnelCanvas");
const ctx = canvas.getContext("2d");

function drawPlaceholder() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = "#45f4b9";
  ctx.fillRect(rect.width * 0.35, rect.height * 0.4, rect.width * 0.3, rect.height * 0.2);
  ctx.fillStyle = "#04131f";
  ctx.font = "16px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("airfoil-lab boot", rect.width * 0.5, rect.height * 0.52);
}

console.log("airfoil-lab boot");
drawPlaceholder();
window.addEventListener("resize", drawPlaceholder);