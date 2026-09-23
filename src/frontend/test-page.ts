export const testPageHtml = String.raw`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Active Travel Agent Test</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; }
      section { margin: 0 0 20px; }
      label { display: block; margin: 8px 0; }
      input { margin-left: 8px; }
      button { margin: 4px 8px 4px 0; }
      pre { white-space: pre-wrap; border: 1px solid #ccc; padding: 12px; min-height: 220px; }
      #agentStatus { font-weight: bold; }
      .board { display: grid; gap: 12px; max-width: 760px; }
      .card { border: 1px solid #c8b998; padding: 14px; background: #f7f0df; }
      .tags span { display: inline-block; margin: 4px 6px 0 0; padding: 4px 8px; border: 1px solid #d4c39d; }
      .modalBackdrop { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,.35); }
      .modalBackdrop.open { display: flex; }
      .modal { width: min(680px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow: auto; background: #fff; border: 1px solid #333; padding: 16px; }
    </style>
  </head>
  <body>
    <h1>Active Travel Agent Test</h1>

    <section>
      <h2>Common</h2>
      <label>userId <input id="userIdInput" value="demo-user" /></label>
      <button id="healthBtn">GET /health</button>
      <button id="profileBtn">GET /api/user/profile</button>
      <button id="historyBtn">GET /api/journal/history</button>
      <button id="clearBtn">Clear output</button>
    </section>

    <section>
      <h2>Active Location Agent</h2>
      <div id="agentStatus">stopped</div>
      <label>latitude <input id="latitudeInput" value="23.1291" /></label>
      <label>longitude <input id="longitudeInput" value="113.2644" /></label>
      <button id="locationBtn">Manual location-sync</button>
      <button id="questBoardBtn">Generate Quest Board</button>
      <button id="startAgentBtn">Start active agent</button>
      <button id="stopAgentBtn" disabled>Stop active agent</button>
    </section>

    <section>
      <h2>Commission Dialog</h2>
      <label>user text <input id="commissionTextInput" value="我吃完饭了" /></label>
      <button id="interpretCommissionBtn">Interpret text</button>
      <button id="acceptCommissionBtn" disabled>Accept commission</button>
      <button id="completeCommissionBtn" disabled>Complete commission</button>
    </section>

    <section>
      <h2>Quest Board</h2>
      <div id="questBoard" class="board"></div>
    </section>

    <section>
      <h2>Output</h2>
      <pre id="output"></pre>
    </section>

    <div id="questModalBackdrop" class="modalBackdrop">
      <div class="modal">
        <h2 id="questModalTitle">Quest</h2>
        <pre id="questModalBody"></pre>
        <button id="closeQuestModalBtn">Close</button>
      </div>
    </div>

    <script>
      const output = document.getElementById("output");
      const locationBtn = document.getElementById("locationBtn");
      const questBoardBtn = document.getElementById("questBoardBtn");
      const interpretCommissionBtn = document.getElementById("interpretCommissionBtn");
      const acceptCommissionBtn = document.getElementById("acceptCommissionBtn");
      const completeCommissionBtn = document.getElementById("completeCommissionBtn");
      const startAgentBtn = document.getElementById("startAgentBtn");
      const stopAgentBtn = document.getElementById("stopAgentBtn");
      const agentStatus = document.getElementById("agentStatus");
      const questBoard = document.getElementById("questBoard");
      const questModalBackdrop = document.getElementById("questModalBackdrop");
      const questModalTitle = document.getElementById("questModalTitle");
      const questModalBody = document.getElementById("questModalBody");

      let watchId = null;
      let heartbeatId = null;
      let lastAgentLocation = null;
      let lastAgentSentAt = 0;
      let activeAgentRunning = false;
      let pendingCommissionIntent = null;
      let activeCommission = null;
      const activeAgentIntervalMs = 30000;
      const activeAgentMinDistanceMeters = 50;

      function getUserId() {
        return document.getElementById("userIdInput").value || "demo-user";
      }

      function getLocationInput() {
        return {
          latitude: Number(document.getElementById("latitudeInput").value),
          longitude: Number(document.getElementById("longitudeInput").value)
        };
      }

      function write(title, data) {
        const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        output.textContent += "\\n\\n--- " + title + " ---\\n" + text;
        output.scrollTop = output.scrollHeight;
      }

      function setAgentStatus(text) {
        agentStatus.textContent = text;
      }

      function openQuestModal(title, body) {
        questModalTitle.textContent = title || "New quest";
        questModalBody.textContent = typeof body === "string" ? body : JSON.stringify(body, null, 2);
        questModalBackdrop.classList.add("open");
      }

      function closeQuestModal() {
        questModalBackdrop.classList.remove("open");
      }

      async function requestJson(title, url, options = {}) {
        try {
          const response = await fetch(url, {
            ...options,
            headers: { "x-user-id": getUserId(), ...(options.headers || {}) }
          });
          const text = await response.text();
          let data = text;
          try { data = JSON.parse(text); } catch {}
          write(title + " status=" + response.status, data);
          return data;
        } catch (error) {
          write(title + " error", String(error));
          return null;
        }
      }

      function parseSseEvents(buffer) {
        return buffer.split("\\n\\n").filter(Boolean).map((chunk) => {
          const lines = chunk.split("\\n");
          const eventLine = lines.find((line) => line.startsWith("event:"));
          const dataLines = lines.filter((line) => line.startsWith("data:"));
          const event = eventLine ? eventLine.slice(6).trim() : "message";
          const dataText = dataLines.map((line) => line.slice(5).trim()).join("\\n");
          let data = dataText;
          try { data = JSON.parse(dataText); } catch {}
          return { event, data };
        });
      }

      async function locationSync(options = {}) {
        const source = options.source || "manual";
        const location = getLocationInput();
        if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
          write("location-sync", "latitude and longitude must be valid numbers.");
          return;
        }

        if (source === "manual") locationBtn.disabled = true;
        try {
          const response = await fetch("/api/action/location-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-user-id": getUserId() },
            body: JSON.stringify({ userId: getUserId(), ...location, accuracy: options.accuracy, timestamp: Date.now(), source })
          });
          const contentType = response.headers.get("content-type") || "";
          write("location-sync " + source + " status=" + response.status, "content-type: " + contentType);

          if (!contentType.includes("text/event-stream")) {
            const data = await response.json();
            write("location-sync " + source + " json", data);
            if (data.reason === "COOLDOWN") setAgentStatus("running, cooldown " + Math.ceil((data.nextCheckAfterMs || 0) / 1000) + "s");
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let pending = "";
          let questPayload = null;
          const storyTokens = [];
          while (true) {
            const result = await reader.read();
            if (result.done) break;
            pending += decoder.decode(result.value, { stream: true });
            const lastBoundary = pending.lastIndexOf("\\n\\n");
            if (lastBoundary < 0) continue;
            const complete = pending.slice(0, lastBoundary);
            pending = pending.slice(lastBoundary + 2);
            for (const event of parseSseEvents(complete)) {
              write("sse " + event.event, event.data);
              if (event.event === "quest") questPayload = event.data;
              if (event.event === "story-token" && event.data && event.data.text) storyTokens.push(event.data.text);
            }
          }
          if (questPayload) {
            setAgentStatus("running, quest triggered");
            openQuestModal(questPayload.title, { story: storyTokens, pois: questPayload.pois, routeLines: questPayload.routeLines });
          }
        } catch (error) {
          write("location-sync error", String(error));
        } finally {
          if (source === "manual") locationBtn.disabled = false;
        }
      }

      async function generateQuestBoard() {
        const location = getLocationInput();
        questBoardBtn.disabled = true;
        try {
          const data = await requestJson("quest-board", "/api/action/quest-board", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: getUserId(), ...location, count: 4 })
          });
          renderQuestBoard(data && data.quests ? data.quests : []);
        } finally {
          questBoardBtn.disabled = false;
        }
      }

      async function interpretCommission() {
        const text = document.getElementById("commissionTextInput").value;
        const location = getLocationInput();
        const data = await requestJson("commission-interpret", "/api/action/commission/interpret", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: getUserId(), text, ...location })
        });
        pendingCommissionIntent = data;
        acceptCommissionBtn.disabled = !(data && data.shouldGenerateCommission);
        completeCommissionBtn.disabled = true;
        openQuestModal("智能体回应", data || "No response");
      }

      async function acceptCommission() {
        if (!pendingCommissionIntent || !pendingCommissionIntent.shouldGenerateCommission) return;
        const location = getLocationInput();
        const data = await requestJson("commission-generate", "/api/action/commission/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: getUserId(),
            scenario: pendingCommissionIntent.scenario,
            ...location
          })
        });
        activeCommission = data && data.commission ? data.commission : null;
        completeCommissionBtn.disabled = !activeCommission;
        if (activeCommission) {
          renderQuestBoard([activeCommission]);
          openQuestModal(activeCommission.title, activeCommission);
        }
      }

      async function completeCommission() {
        if (!activeCommission) return;
        const data = await requestJson("commission-complete", "/api/action/commission/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: getUserId(),
            commission: activeCommission,
            userNote: "用户在测试页完成了该探索委托。"
          })
        });
        openQuestModal(data && data.title ? data.title : "委托完成", data || "No summary");
      }

      function renderQuestBoard(quests) {
        questBoard.innerHTML = "";
        for (const quest of quests) {
          const card = document.createElement("div");
          card.className = "card";
          card.innerHTML =
            "<div>探索委托单 <strong style='float:right'>+" + quest.xp + " XP</strong></div>" +
            "<h3>" + escapeHtml(quest.title) + "</h3>" +
            "<div>" + escapeHtml(quest.subtitle) + "</div>" +
            "<p>" + escapeHtml(quest.description) + "</p>" +
            "<div class='tags'>" + quest.rewardTags.map((tag) => "<span>" + escapeHtml(tag) + "</span>").join("") + "</div>" +
            "<p>" + escapeHtml(quest.suitableFor) + "</p>";
          card.addEventListener("click", () => openQuestModal(quest.title, quest));
          questBoard.appendChild(card);
        }
      }

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
      }

      function updateLocationInputs(position) {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        document.getElementById("latitudeInput").value = String(latitude);
        document.getElementById("longitudeInput").value = String(longitude);
        return { latitude, longitude, accuracy: position.coords.accuracy };
      }

      function distanceMeters(a, b) {
        if (!a || !b) return Infinity;
        const earthRadius = 6371000;
        const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
        const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
        const lat1 = (a.latitude * Math.PI) / 180;
        const lat2 = (b.latitude * Math.PI) / 180;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      }

      async function activeHeartbeat(location, reason) {
        if (!activeAgentRunning) return;
        const now = Date.now();
        const moved = distanceMeters(lastAgentLocation, location);
        const due = now - lastAgentSentAt >= activeAgentIntervalMs;
        if (!due && moved < activeAgentMinDistanceMeters) return;
        lastAgentLocation = location;
        lastAgentSentAt = now;
        setAgentStatus("running, checking location (" + reason + ")");
        await locationSync({ source: "active-agent", accuracy: location.accuracy });
        if (activeAgentRunning) setAgentStatus("running, waiting for next heartbeat");
      }

      function startActiveAgent() {
        if (activeAgentRunning) return;
        activeAgentRunning = true;
        startAgentBtn.disabled = true;
        stopAgentBtn.disabled = false;
        setAgentStatus("starting");
        if (navigator.geolocation) {
          watchId = navigator.geolocation.watchPosition(
            (position) => activeHeartbeat(updateLocationInputs(position), "watchPosition"),
            (error) => { write("active-agent geolocation error", error.message); setAgentStatus("geolocation error, using manual coordinates heartbeat"); },
            { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 }
          );
        }
        heartbeatId = window.setInterval(() => activeHeartbeat({ ...getLocationInput(), accuracy: undefined }, "interval"), activeAgentIntervalMs);
        setAgentStatus("running, waiting for location");
      }

      function stopActiveAgent() {
        activeAgentRunning = false;
        if (watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
        if (heartbeatId !== null) window.clearInterval(heartbeatId);
        watchId = null;
        heartbeatId = null;
        startAgentBtn.disabled = false;
        stopAgentBtn.disabled = true;
        setAgentStatus("stopped");
      }

      document.getElementById("healthBtn").addEventListener("click", () => requestJson("health", "/health"));
      document.getElementById("profileBtn").addEventListener("click", () => requestJson("profile", "/api/user/profile"));
      document.getElementById("historyBtn").addEventListener("click", () => requestJson("history", "/api/journal/history"));
      locationBtn.addEventListener("click", () => locationSync({ source: "manual" }));
      questBoardBtn.addEventListener("click", generateQuestBoard);
      interpretCommissionBtn.addEventListener("click", interpretCommission);
      acceptCommissionBtn.addEventListener("click", acceptCommission);
      completeCommissionBtn.addEventListener("click", completeCommission);
      startAgentBtn.addEventListener("click", startActiveAgent);
      stopAgentBtn.addEventListener("click", stopActiveAgent);
      document.getElementById("closeQuestModalBtn").addEventListener("click", closeQuestModal);
      document.getElementById("clearBtn").addEventListener("click", () => { output.textContent = ""; });
    </script>
  </body>
</html>`;
