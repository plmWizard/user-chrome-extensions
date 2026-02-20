chrome.storage.sync.get(['enableResendEmailButton'], (data) => {
  if (!data.enableResendEmailButton) return;

  (function () {
    let isButtonInjected = false;

    redirectIfFromUserSave();
    displayRedirectedBanner();
    onLocationChange();

    window.addEventListener("hashchange", onLocationChange);
    window.addEventListener("popstate", onLocationChange);

    function redirectIfFromUserSave() {
      const isRedirectSource =
        window.location.pathname.endsWith("adminUsers.do") &&
        new URLSearchParams(window.location.search).has("userId");

      if (!isRedirectSource) return;

      const banner = document.querySelector(".confirmationContainer.success");
      if (banner) {
        const rawText = banner.innerText.trim();
        const message = rawText.replace("saved", "reinvited");
        if (message) {
          sessionStorage.setItem("plm360-banner", message);
        }
      }

      const target = `${window.location.origin}/admin#section=adminusers&tab=users`;
      window.location.replace(target);
    }

    function displayRedirectedBanner() {
      const isAdminUsersTab =
        window.location.pathname.endsWith("/admin") &&
        window.location.hash.includes("section=adminusers&tab=users");

      if (!isAdminUsersTab) return;

      const message = sessionStorage.getItem("plm360-banner");
      if (!message) return;

      const container = document.createElement("div");
      container.className = "confirmationContainer success";
      container.innerHTML = `
        <div class="confirmation">
          <div><span>${message}</span></div>
        </div>
      `;

      const target = document.querySelector("#content") || document.body;
      target.prepend(container);
      sessionStorage.removeItem("plm360-banner");
    }

    function onLocationChange() {
      const itemId = getItemIdFromHash();
      if (!itemId || itemId.startsWith("NewUser")) {
        removeResendButton();
        return;
      }

      const formElement = findUserDetailsForm();
      if (!formElement) {
        removeResendButton();
        observeFormAndInjectButton();
        return;
      }

      injectResendButton(formElement);
    }

    function getItemIdFromHash() {
      return new URLSearchParams(window.location.hash.substring(1)).get("item");
    }

    function removeResendButton() {
      const cell = document.getElementById("resendInviteBtn")?.closest("td");
      if (cell) {
        cell.remove();
        isButtonInjected = false;
      }
    }

    function observeFormAndInjectButton() {
      if (isButtonInjected) return;

      const observer = new MutationObserver(() => {
        const form = findUserDetailsForm();
        if (form) {
          observer.disconnect();
          injectResendButton(form);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 5000);
    }

    function findUserDetailsForm() {
      return document.querySelector("input[name='notifyEmailModification']")?.closest("form") || null;
    }

    function injectResendButton(form) {
      if (document.getElementById("resendInviteBtn")) {
        isButtonInjected = true;
        return true;
      }

      const row = document.querySelector("table.submenubuttonwrapper tbody tr");
      if (!row) return false;

      const requiredCell = row.querySelector("span.required_asterisk")?.closest("td");
      if (!requiredCell) return false;

      const cell = document.createElement("td");
      const button = document.createElement("input");
      button.type = "button";
      button.id = "resendInviteBtn";
      button.className = "submitinput";
      button.value = "Resend Invitation";
      button.addEventListener("click", () => handleResendClick(form, button));

      cell.appendChild(button);
      requiredCell.parentElement.insertBefore(cell, requiredCell);
      isButtonInjected = true;
      return true;
    }

    function handleResendClick(form, button) {
      const notifyField = form.querySelector("input[name='notifyEmailModification']");
      const emailField = form.querySelector("input[name='oldEmail']");
      if (!notifyField || !emailField?.value) return;

      notifyField.value = "true";
      button.disabled = true;
      button.value = "Resending…";
      form.submit();
    }
  })();
});