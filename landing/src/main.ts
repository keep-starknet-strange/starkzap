const NPM_CMD = "npm install starkzap";

const codeEl = document.getElementById("npm-cmd");
const copyBtn = document.getElementById("copy-btn");

if (copyBtn && codeEl) {
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(NPM_CMD);
      copyBtn.textContent = "Copied!";
      copyBtn.classList.add("copied");
      setTimeout(() => {
        copyBtn.textContent = "Copy";
        copyBtn.classList.remove("copied");
      }, 2000);
    } catch {
      copyBtn.textContent = "Copy failed";
      setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 2000);
    }
  });
}
