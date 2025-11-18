// ======================================================
// brackets.js — Playoffs bloqueados até fim da época regular
// ======================================================

import {
  supabase,
  getInscritos,
  setupThemeToggle,
  getTournamentState,
  computeRanking,
  setupRoleDropdown,
  isAdmin
} from "./main.js";

setupThemeToggle();
setupRoleDropdown();


document.addEventListener("DOMContentLoaded", async () => {
  const btnGerar = document.getElementById("gerarBrackets");
  const dialog = document.getElementById("resultDialog");
  const formDialog = document.getElementById("resultForm");
  const inputRes = document.getElementById("newResult");
  const matchNames = document.getElementById("matchNames");
  const container = document.getElementById("brackets");
  const btnReset = document.getElementById("resetTorneio");
  const controls = document.querySelector(".controls");

  let editingMatch = null;
  let bracketsData = { rounds: [] };

  // ---------- VERIFICAR ESTADO DO TORNEIO ----------
  const faseTerminada = await getTournamentState();

  if (!faseTerminada) {
    // 🔒 Esconder controlos e mostrar mensagem central
    if (controls) controls.style.display = "none";

    container.innerHTML = `
      <div class="fase-bloqueada">
        <div class="mensagem">
          <h2>🏆 Os Playoffs ainda não estão disponíveis</h2>
          <p>Termina primeiro a época regular para desbloquear esta fase.</p>
          <a href="matches.html" class="btn-voltar">⬅️ Voltar à Época Regular</a>
        </div>
      </div>
    `;

    const css = document.createElement("style");
    css.textContent = `
      .fase-bloqueada {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 75vh;
        width: 100%;
      }

      .mensagem {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: rgba(255,255,255,0.85);
        border-radius: 16px;
        padding: 40px 50px;
        box-shadow: 0 4px 25px rgba(0,0,0,0.1);
        text-align: center;
        backdrop-filter: blur(8px);
      }

      .mensagem h2 {
        font-size: 2rem;
        margin-bottom: 0.8rem;
        color: #111;
      }

      .mensagem p {
        font-size: 1.2rem;
        opacity: 0.8;
        margin-bottom: 1.5rem;
      }

      .btn-voltar {
        background: #2563eb;
        color: #fff;
        padding: 0.8rem 1.6rem;
        border-radius: 10px;
        text-decoration: none;
        font-weight: 600;
        font-size: 1rem;
        transition: background 0.25s ease;
      }

      .btn-voltar:hover {
        background: #1d4ed8;
      }

      /* dark mode */
      body.dark-mode .mensagem {
        background: rgba(34,34,34,0.9);
        color: #eee;
      }
      body.dark-mode .mensagem h2 { color: #fff; }
      body.dark-mode .btn-voltar {
        background: #3b82f6;
      }
      body.dark-mode .btn-voltar:hover {
        background: #1e40af;
      }
    `;
    document.head.appendChild(css);
    return; // Sai do script — não carrega brackets nem botões
  }

  // ---------- RESET BRACKETS ----------
  btnReset?.addEventListener("click", async () => {
    if (!isAdmin()) return alert("Apenas o admin pode resetar.");
    if (!confirm("⚠️ Tens a certeza que queres resetar os brackets?")) return;

    const { data: existing } = await supabase
      .from("brackets")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (existing) await supabase.from("brackets").delete().eq("id", existing.id);

    bracketsData = { rounds: [] };
    renderBrackets();
    alert("✅ Brackets apagados com sucesso!");
  });

  // ---------- GERAR BRACKETS ----------
  btnGerar?.addEventListener("click", async () => {
    if (!isAdmin()) return alert("Apenas o admin pode gerar os brackets.");

    const inscritos = await getInscritos();
    if (!inscritos || inscritos.length < 2) {
      alert("Precisas de pelo menos 2 inscritos!");
      return;
    }

    const ranking = computeRanking(inscritos);

    let q = 8;
    if (ranking.length < 8) q = ranking.length >= 4 ? 4 : 2;
    if (ranking.length < 2) {
      alert("Ainda não há jogadores suficientes para Playoffs.");
      return;
    }

    const qualificados = ranking.slice(0, q).map((r) => r.username);
    const pares = [];
    for (let i = 0; i < Math.floor(qualificados.length / 2); i++) {
      pares.push([qualificados[i], qualificados[qualificados.length - 1 - i]]);
    }

    const rounds = [];
    const r1 = pares.map(([a, b]) => ({
      j1: a,
      j2: b,
      resultado: "–",
      vencedor: null,
    }));
    rounds.push(r1);

    const pot = q;
    const numRounds = Math.log2(pot);
    for (let r = 1; r < numRounds; r++) {
      const next = [];
      for (let i = 0; i < Math.pow(2, numRounds - r - 1); i++) {
        next.push({
          j1: "A aguardar",
          j2: "A aguardar",
          resultado: "–",
          vencedor: null,
        });
      }
      rounds.push(next);
    }

    bracketsData = { rounds };

    await supabase.from("brackets").delete().neq("id", "");
    const { error } = await supabase
      .from("brackets")
      .insert([{ data: bracketsData }]);
    if (error) {
      console.error(error);
      alert("❌ Erro ao guardar brackets!");
      return;
    }

    alert(`✅ Brackets gerados (${q} qualificados).`);
    renderBrackets();
  });

  // ---------- CARREGAR E REALTIME ----------
  async function loadBrackets() {
    const { data, error } = await supabase.from("brackets").select("*").single();
    if (error && error.code !== "PGRST116") console.error(error);
    bracketsData = data?.data || { rounds: [] };
    renderBrackets();
  }

  await loadBrackets();

  // ---------- SUBSCRIÇÃO REALTIME ----------
  supabase
    .channel("brackets-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "brackets" }, loadBrackets)
    .subscribe();

  // ---------- FUNÇÕES AUXILIARES ----------
  function calcularVencedor(resultado) {
    const partes = (resultado || "").split("-");
    if (partes.length === 2) {
      const [a, b] = partes.map((n) => parseInt(n));
      if (!isNaN(a) && !isNaN(b)) return a > b ? 1 : b > a ? 2 : 0;
    }
    return 0;
  }

  function nomeRonda(index, totalRounds) {
    const rem = totalRounds - index;
    switch (rem) {
      case 1:
        return "Final";
      case 2:
        return "Semifinais";
      case 3:
        return "Quartas de Final";
      case 4:
        return "Oitavos de Final";
      default:
        return `Ronda ${index + 1}`;
    }
  }

  // ---------- RENDER BRACKETS ----------
  function renderBrackets() {
    container.innerHTML = "";
    container.style.position = "relative";

    if (!bracketsData.rounds.length) {
      container.innerHTML = "<p>Nenhum bracket gerado ainda.</p>";
      return;
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("bracket-lines");
    svg.style.position = "absolute";
    svg.style.width = "100%";
    svg.style.height = "100%";
    container.appendChild(svg);

    const totalRounds = bracketsData.rounds.length;

    bracketsData.rounds.forEach((round, rIdx) => {
      const roundDiv = document.createElement("div");
      roundDiv.className = "round";

      const title = document.createElement("div");
      title.className = "round-title";
      title.textContent = nomeRonda(rIdx, totalRounds);
      roundDiv.appendChild(title);

      round.forEach((match, mIdx) => {
        const matchDiv = document.createElement("div");
        matchDiv.className = "match";

        const team1 = document.createElement("div");
        team1.className =
          "team team-top" + (match.j1 === "A aguardar" ? " pending" : "");
        team1.innerHTML = `
          <span class="name">${match.j1}</span>
          <span class="score">${
            match.resultado?.includes("-")
              ? match.resultado.split("-")[0]
              : "–"
          }</span>`;

        const team2 = document.createElement("div");
        team2.className =
          "team team-bottom" + (match.j2 === "A aguardar" ? " pending" : "");
        team2.innerHTML = `
          <span class="name">${match.j2}</span>
          <span class="score">${
            match.resultado?.includes("-")
              ? match.resultado.split("-")[1]
              : "–"
          }</span>`;

        if (match.resultado?.includes("-")) {
          const [a, b] = match.resultado.split("-").map(Number);
          if (!isNaN(a) && !isNaN(b) && a !== b) {
            if (a > b) {
              team1.classList.add("winner-flash");
              team2.classList.add("loser");
            } else {
              team2.classList.add("winner-flash");
              team1.classList.add("loser");
            }
          }
        }

        if (
          isAdmin() &&
          match.j1 !== "A aguardar" &&
          match.j2 !== "A aguardar" &&
          match.j2 !== "BYE"
        ) {
          [team1, team2].forEach((t) => {
            t.style.cursor = "pointer";
            t.addEventListener("click", () => {
              editingMatch = { roundIndex: rIdx, matchIndex: mIdx };
              matchNames.textContent = `${match.j1} vs ${match.j2}`;
              inputRes.value =
                match.resultado && match.resultado !== "–"
                  ? match.resultado
                  : "";
              dialog.showModal();
            });
          });
        }

        matchDiv.appendChild(team1);
        matchDiv.appendChild(team2);
        roundDiv.appendChild(matchDiv);
      });

      container.appendChild(roundDiv);
    });

    setTimeout(drawConnectors, 80);
  }


  // ========= Campeão: popup com animação e fundo =========
  let championShown = false; // <- controla se já mostramos durante esta sessão
  const CHAMPION_BG = "assets/img/winner.png";

  function getFinalWinner(data) {
    if (!data?.rounds?.length) return null;
    const lastRound = data.rounds[data.rounds.length - 1];
    if (!lastRound?.length) return null;
    const finalMatch = lastRound[0];
    if (finalMatch?.vencedor && typeof finalMatch.resultado === "string" && finalMatch.resultado.includes("-")) {
      return finalMatch.vencedor;
    }
    return null;
  }

  function maybeTriggerChampion(triggeredBy = "system") {
    const winner = getFinalWinner(bracketsData);
    if (!winner) return;

    // só mostra se ainda não foi mostrado nesta sessão
    if (championShown) return;

    // só dispara automaticamente quando o trigger vem de um resultado finalizado
    if (triggeredBy === "render") return;

    showChampionDialog(winner);
    championShown = true;
  }

  function showChampionDialog(winnerName) {
    if (document.getElementById("championDialog")?.open) return;

    const css = document.getElementById("champion-style") || document.createElement("style");
    css.id = "champion-style";
    css.textContent = `
      dialog#championDialog {
        width: min(880px, 92vw);
        height: min(520px, 80vh);
        padding: 0;
        border: none;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 8px 40px rgba(0,0,0,.35);
        background: #000;
      }
      dialog#championDialog::backdrop {
        background: rgba(0,0,0,.55);
        backdrop-filter: blur(2px);
      }
      .champion-wrap {
        position: relative;
        width: 100%;
        height: 100%;
        background-size: cover;
        background-position: center;
      }
      .champion-card {
        position: absolute;
        inset: auto 24px 24px 24px;
        margin: 0 auto;
        max-width: 540px;
        background: #fff;
        color: #111;
        border-radius: 14px;
        padding: 20px 22px;
        box-shadow: 0 10px 30px rgba(0,0,0,.25);
        animation: popIn .5s ease-out;
      }
      body.dark-mode .champion-card {
        background: #1f2937;
        color: #f3f4f6;
      }
      .champion-card h2 {
        font-size: 1.8rem;
        margin: 0 0 6px 0;
      }
      .champion-card p {
        margin: 0 0 12px 0;
        opacity: .9;
      }
      .champion-actions {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 8px;
      }
      .champion-btn {
        border: none;
        border-radius: 10px;
        padding: 10px 14px;
        font-weight: 600;
        cursor: pointer;
        transition: transform .1s ease, opacity .2s ease;
      }
      .champion-btn:active { transform: translateY(1px); }
      .btn-ok   { background:#16a34a; color:#fff; }
      .btn-ok:hover { opacity: .9; }
      @keyframes popIn {
        from { transform: translateY(8px) scale(.98); opacity: 0; }
        to   { transform: translateY(0) scale(1); opacity: 1; }
      }
      #confettiCanvas {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .champion-name {
        display:inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        background: #fde68a;
        color: #7c2d12;
        font-weight: 800;
      }
      body.dark-mode .champion-name {
        background: #854d0e;
        color: #fff7ed;
      }
    `;
    document.head.appendChild(css);

    const dialog = document.createElement("dialog");
    dialog.id = "championDialog";
    dialog.innerHTML = `
      <div class="champion-wrap" style="background-image:url('${CHAMPION_BG}')">
        <canvas id="confettiCanvas"></canvas>
        <div class="champion-card">
          <h2>🏆 Parabéns, <span class="champion-name">${winnerName}</span>!</h2>
          <p>És o grande campeão do <strong>Estamine</strong>! Ganhaste Merda nenhuma.</p>
          <div class="champion-actions">
            <button class="champion-btn btn-ok">Fechar</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    dialog.querySelector(".btn-ok").addEventListener("click", () => dialog.close());
    dialog.showModal();
    startConfetti(dialog.querySelector("#confettiCanvas"));
  }

  function startConfetti(canvas, dialog) {
    const ctx = canvas.getContext("2d");
    const DPR = window.devicePixelRatio || 1;

    // garantir que o canvas cobre o viewport inteiro
    const resize = () => {
      canvas.width  = Math.floor(window.innerWidth  * DPR);
      canvas.height = Math.floor(window.innerHeight * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    resize();

    const W = () => canvas.width  / DPR;
    const H = () => canvas.height / DPR;

    const colors = ["#FFD166","#06D6A0","#EF476F","#118AB2","#FCA5A5","#34D399","#F59E0B","#60A5FA"];

    const pieces = Array.from({ length: 160 }, () => ({
      x: Math.random() * W(),          
      y: Math.random() * -H(),         
      size: 6 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      velX: -0.6 + Math.random() * 1.2,
      velY: 2 + Math.random() * 3.8,
      color: colors[(Math.random() * colors.length) | 0],
    }));

    let running = true;

    function animate() {
      if (!running) return;

      // limpar com dimensão real
      ctx.clearRect(0, 0, W(), H());

      for (const p of pieces) {
        p.x += p.velX;
        p.y += p.velY;
        p.rot += 0.05;

        // reaparecer quando sai do fundo ou pelas laterais
        if (p.y > H() + 20) { p.y = -20; p.x = Math.random() * W(); }
        if (p.x < -20) p.x = W() + 20;
        if (p.x > W() + 20) p.x = -20;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
        ctx.restore();
      }

      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);

    // parar quando o dialog fecha
    dialog.addEventListener("close", () => (running = false));
    window.addEventListener("resize", () => {
      resize();
      // opcional: reposicionar algumas peças para preencher novas áreas
      for (const p of pieces) {
        if (p.x > W()) p.x = Math.random() * W();
        if (p.y > H()) p.y = Math.random() * H();
      }
    });
  }


  // ---------- DESENHAR LINHAS ----------
  function drawConnectors() {
    const svg = container.querySelector(".bracket-lines");
    if (!svg) return;
    svg.innerHTML = "";

    const rounds = [...container.querySelectorAll(".round")];
    const contRect = container.getBoundingClientRect();

    for (let r = 0; r < rounds.length - 1; r++) {
      const currMatches = rounds[r].querySelectorAll(".match");
      const nextMatches = rounds[r + 1].querySelectorAll(".match");

      currMatches.forEach((match, i) => {
        const rect1 = match.getBoundingClientRect();
        const next = nextMatches[Math.floor(i / 2)];
        if (!next) return;
        const rect2 = next.getBoundingClientRect();

        const x1 = rect1.right - contRect.left;
        const y1 = rect1.top + rect1.height / 2 - contRect.top;
        const x2 = rect2.left - contRect.left;
        const y2 = rect2.top + rect2.height / 2 - contRect.top;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute(
          "d",
          `M${x1} ${y1} C${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}`
        );
        path.setAttribute("stroke", "#ccc");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("fill", "none");
        svg.appendChild(path);
      });
    }
  }

  // ---------- GUARDAR RESULTADO ----------
  formDialog?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!editingMatch) return;

    const { roundIndex, matchIndex } = editingMatch;
    const novo = inputRes.value.trim() || "–";
    const match = bracketsData.rounds[roundIndex][matchIndex];

    match.resultado = novo;
    const vencedorNum = calcularVencedor(novo);
    match.vencedor =
      vencedorNum === 1 ? match.j1 : vencedorNum === 2 ? match.j2 : null;

    if (roundIndex < bracketsData.rounds.length - 1 && match.vencedor) {
      const nextRound = bracketsData.rounds[roundIndex + 1];
      const nextIndex = Math.floor(matchIndex / 2);
      if (nextRound[nextIndex]) {
        if (matchIndex % 2 === 0) nextRound[nextIndex].j1 = match.vencedor;
        else nextRound[nextIndex].j2 = match.vencedor;
      }
    }

    const { data: existing } = await supabase
      .from("brackets")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (existing)
      await supabase
        .from("brackets")
        .update({ data: bracketsData })
        .eq("id", existing.id);
    else await supabase.from("brackets").insert([{ data: bracketsData }]);

    dialog.close();
    renderBrackets();
    maybeTriggerChampion("final");
  });

  loadBrackets();
});
