import { supabase, getInscritos, updateStats, setTournamentState, getTournamentState, lockPlayoffsNavUntilFinished } from "./main.js";
import { setupThemeToggle, setupRoleDropdown, isAdmin } from "./main.js";

setupThemeToggle();
setupRoleDropdown();
lockPlayoffsNavUntilFinished();


document.addEventListener("DOMContentLoaded", async () => {

  const { data: estado } = await supabase
    .from("torneio_estado")
    .select("fase_regular_concluida")
    .limit(1)
    .maybeSingle();

  if (estado?.fase_regular_concluida) {
    mostrarDialogoEpocaTerminada();
    return;
  }

  const container = document.getElementById("matchesContainer");
  const gerarBtn = document.getElementById("gerarMatches");
  const dialog = document.getElementById("resultDialog");
  const homeInput = document.getElementById("homeScore");
  const awayInput = document.getElementById("awayScore");
    const cancelBtn = document.getElementById("cancelResultBtn");
  let selectedMatch = null;


  // ---------- TERMINAR ÉPOCA REGULAR ----------
  const fecharBtn = document.getElementById("fecharEpoca");
  fecharBtn.addEventListener("click", async () => {
    if (!isAdmin()) return alert("Apenas o admin pode terminar a época regular.");
    const ok = confirm("⚠️ Queres mesmo terminar a época regular? Isto vai ativar os Playoffs.");
    if (!ok) return;

    await setTournamentState(true);
    alert("✅ Época regular terminada. Os Playoffs estão disponíveis.");
    lockPlayoffsNavUntilFinished();
  });


  // ---------- GERAR JOGOS ----------
  gerarBtn.addEventListener("click", async () => {
    if (!isAdmin()) return alert("Apenas o admin pode gerar jogos.");

    const inscritos = await getInscritos();
    if (inscritos.length < 2) return alert("Precisas de pelo menos 2 jogadores.");

    const players = [...inscritos.map(p => p.username)];
    if (players.length % 2 !== 0) players.push("BYE");

    const totalRounds = players.length - 1;
    const matches = [];
    let jornada = 1;

    const horaParaMin = (h) => {
      const [horas, minutos] = h.split(":").map(Number);
      return horas * 60 + minutos;
    };

    function temHorarioEmComum(j1, j2) {
      if (!j1.dias || !j2.dias || !j1.horario || !j2.horario) return false;
      const comuns = j1.dias.filter((d) => j2.dias.includes(d));
      if (comuns.length === 0) return false;
      const [inicio1, fim1] = j1.horario.split(" - ");
      const [inicio2, fim2] = j2.horario.split(" - ");
      const s1 = horaParaMin(inicio1);
      const e1 = horaParaMin(fim1);
      const s2 = horaParaMin(inicio2);
      const e2 = horaParaMin(fim2);
      return s1 < e2 && s2 < e1;
    }

    const arr = [...players];

    for (let round = 0; round < totalRounds; round++) {
      const jornadaMatches = [];

      for (let i = 0; i < arr.length / 2; i++) {
        const home = arr[i];
        const away = arr[arr.length - 1 - i];
        if (home !== "BYE" && away !== "BYE") {
          const j1 = inscritos.find(p => p.username === home);
          const j2 = inscritos.find(p => p.username === away);
          const compat = j1 && j2 ? temHorarioEmComum(j1, j2) : false;

          jornadaMatches.push({
            home,
            away,
            homeScore: null,
            awayScore: null,
            status: "pendente",
            prioridade: compat ? 1 : 0,
            round: jornada
          });
        }
      }

      matches.push(...jornadaMatches);

      const last = arr.pop();
      arr.splice(1, 0, last);
      jornada++;
    }

    await supabase.from("matches").delete().neq("id", 0);
    const { error } = await supabase.from("matches").insert(matches);

    if (error) {
      alert("❌ Erro ao gerar jogos: " + error.message);
    } else {
      alert("✅ Jogos gerados com sucesso!");
      renderMatches();
    }
  });

  // ---------- MOSTRAR JOGOS ----------
  async function renderMatches() {
    const { data } = await supabase
      .from("matches")
      .select("*")
      .order("round", { ascending: true })
      .order("prioridade", { ascending: false });

    container.innerHTML = "";

    if (!data || data.length === 0) {
      container.innerHTML = `<p>Nenhum jogo gerado.</p>`;
      return;
    }

    const grupos = {};
    data.forEach((m) => {
      if (!grupos[m.round]) grupos[m.round] = [];
      grupos[m.round].push(m);
    });

    Object.keys(grupos).forEach((round) => {
      const sec = document.createElement("section");
      sec.classList.add("jornada");
      sec.innerHTML = `<h3 class="jornada-title">Jornada ${round}</h3>`;

      grupos[round].forEach((m) => {
        const card = document.createElement("div");
        card.classList.add("match-card", m.status === "finalizado" ? "finished" : "pending");
        if (m.prioridade === 1) card.classList.add("compatible");

        card.innerHTML = `
          <div class="names">
            <span>${m.home}</span>
            <span class="score">${m.homeScore ?? "-"} - ${m.awayScore ?? "-"}</span>
            <span>${m.away}</span>
          </div>
          ${isAdmin() ? `<button class="edit" data-id="${m.id}">✏️</button>` : ""}
        `;
        sec.appendChild(card);
      });

      container.appendChild(sec);
    });
  }

  // ---------- EDITAR RESULTADO ----------
  container.addEventListener("click", async (e) => {
    if (!e.target.classList.contains("edit")) return;
    const id = e.target.dataset.id;
    const { data } = await supabase.from("matches").select("*").eq("id", id).single();
    selectedMatch = data;

    document.getElementById("matchNames").textContent = `${data.home} vs ${data.away}`;
    homeInput.value = data.homeScore ?? "";
    awayInput.value = data.awayScore ?? "";

    dialog.showModal();
  });

  cancelBtn?.addEventListener("click", () => {
    dialog.close();
  });


  // ---------- LIMPAR RESULTADOS ----------
  const limparBtn = document.getElementById("limparResultados");

  limparBtn.addEventListener("click", async () => {
    if (!isAdmin()) return alert("Apenas o admin pode limpar resultados.");
    if (!confirm("⚠️ Tens a certeza que queres limpar todos os resultados da fase regular e estatísticas?")) return;

    try {
      // 1️⃣ Reset a todos os jogos
      const { error: matchError } = await supabase
        .from("matches")
        .update({
          homeScore: null,
          awayScore: null,
          status: "pendente",
        })
        .neq("id", 0);

      if (matchError) throw matchError;

      // 2️⃣ Reset das estatísticas dos jogadores
      const { error: resetError } = await supabase
        .from("inscritos")
        .update({
          golosMarcados: 0,
          golosSofridos: 0,
          vitorias: 0,
          derrotas: 0,
          empates: 0,
          totalJogos: 0,
        })
        .neq("id", 0);

      if (resetError) throw resetError;

      alert("✅ Todos os resultados e estatísticas foram limpos!");
      renderMatches();
    } catch (err) {
      console.error("Erro ao limpar resultados:", err);
      alert("❌ Ocorreu um erro ao limpar resultados: " + err.message);
    }
  });

  
  // ---------- GUARDAR RESULTADO + ATUALIZAR STATS ----------
  document.getElementById("saveResultBtn").addEventListener("click", async (e) => {
    e.preventDefault();
    if (!selectedMatch) return;

    const homeScore = parseInt(homeInput.value);
    const awayScore = parseInt(awayInput.value);

    await supabase.from("matches").update({
      homeScore, awayScore, status: "finalizado"
    }).eq("id", selectedMatch.id);

    await recalcularClassificacao();

    dialog.close();
    renderMatches();
  });

  async function mostrarDialogoEpocaTerminada() {
    // Cria o diálogo se ainda não existir
    let dialog = document.getElementById("fimEpocaDialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "fimEpocaDialog";
      dialog.innerHTML = `
        <form method="dialog" class="fim-epoca-form">
          <h2>🏁 Época Regular Terminada</h2>
          <p>A fase regular terminou. Apenas o administrador pode reiniciar a época.</p>
          <button class="adminOnly" id="reiniciarEpocaBtn" type="button">🔄 Reiniciar Época</button>
        </form>
      `;
      document.body.appendChild(dialog);

      // CSS básico do diálogo (mantém teu estilo)
      const css = document.createElement("style");
      css.textContent = `
        .fim-epoca-form {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 2rem;
          border-radius: 12px;
          background: white;
          color: #111;
          min-width: 320px;
          text-align: center;
          z-index: 900;
        }
        .fim-epoca-form h2 {
          font-size: 1.5rem;
          margin-bottom: 0.2rem;
        }
        .fim-epoca-form p {
          font-size: 1rem;
          opacity: 0.85;
          margin-bottom: 1rem;
        }
        .fim-epoca-form button {
          background: #facc15;
          color: #000;
          border: none;
          padding: 0.6rem 1.4rem;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s ease;
        }
        .fim-epoca-form button:hover {
          background: #eab308;
          transform: scale(1.05);
        }
        body.dark-mode .fim-epoca-form {
          background: #1f2937;
          color: #eee;
        }
      `;
      document.head.appendChild(css);
    }

    // Em vez de showModal (que bloqueia header), criamos um overlay controlado
    dialog.setAttribute("open", "true");
    dialog.style.position = "fixed";
    dialog.style.top = "55%";
    dialog.style.left = "50%";
    dialog.style.transform = "translate(-50%, -50%)";
    dialog.style.zIndex = "901";
    dialog.style.border = "none";
    dialog.style.boxShadow = "0 4px 20px rgba(0,0,0,0.25)";

    // Cria overlay que cobre apenas o conteúdo abaixo da header
    let overlay = document.createElement("div");
    overlay.id = "fimEpocaOverlay";
    overlay.style.position = "fixed";
    const header = document.querySelector("header");
    const headerHeight = header ? header.offsetHeight : 80;
    overlay.style.top = `${headerHeight}px`;
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = `calc(100% - ${headerHeight}px)`;
    overlay.style.background = "rgba(0,0,0,0.6)";
    overlay.style.backdropFilter = "blur(4px)";
    overlay.style.zIndex = "900";
    overlay.style.pointerEvents = "auto";
    document.body.appendChild(overlay);

    // Garante que a header fica sempre por cima
    document.querySelector("header").style.zIndex = "1000";

    // Botão Reiniciar
    const reiniciarBtn = dialog.querySelector("#reiniciarEpocaBtn");
    reiniciarBtn.addEventListener("click", async () => {
      const pwd = prompt("Password de administrador:");
      if (pwd !== "admin123") {
        alert("❌ Password incorreta!");
        return;
      }

      if (!confirm("⚠️ Queres mesmo reiniciar a época? Isto vai apagar todos os dados!"))
        return;

      // Limpa dados das tabelas e reseta estado
      await supabase.from("matches").delete().neq("id", 0);
      await supabase
        .from("inscritos")
        .update({
          vitorias: 0,
          derrotas: 0,
          empates: 0,
          golosMarcados: 0,
          golosSofridos: 0,
          totalJogos: 0,
        })
        .neq("id", 0);

      await supabase.from("torneio_estado").update({ fase_regular_concluida: false }).neq("id", 0);

      await supabase.from("brackets").delete().neq("id", 0);

      alert("✅ Época reiniciada com sucesso!");
      dialog.removeAttribute("open");
      document.getElementById("fimEpocaOverlay")?.remove();
      location.reload(); // Recarrega a página normal
    });
  }

  async function recalcularClassificacao() {
    // Buscar todos os jogadores
    const { data: jogadores } = await supabase.from("inscritos").select("username");

    //  Buscar todos os jogos finalizados
    const { data: jogos } = await supabase.from("matches").select("*").eq("status", "finalizado");

    //  Montar mapa de estatísticas zeradas
    const stats = {};
    for (const j of jogadores) {
      stats[j.username] = {
        golosMarcados: 0,
        golosSofridos: 0,
        vitorias: 0,
        derrotas: 0,
        empates: 0,
        totalJogos: 0
      };
    }

    // Percorrer todos os jogos e acumular
    for (const jogo of jogos) {
      const { home, away, homeScore, awayScore } = jogo;
      if (homeScore == null || awayScore == null) continue;

      const empate = homeScore === awayScore;
      const winner = homeScore > awayScore ? home : (homeScore < awayScore ? away : null);
      const loser = homeScore < awayScore ? home : (homeScore > awayScore ? away : null);

      stats[home].golosMarcados += homeScore;
      stats[home].golosSofridos += awayScore;
      stats[home].vitorias += winner === home ? 1 : 0;
      stats[home].derrotas += loser === home ? 1 : 0;
      stats[home].empates += empate ? 1 : 0;
      stats[home].totalJogos += 1;

      stats[away].golosMarcados += awayScore;
      stats[away].golosSofridos += homeScore;
      stats[away].vitorias += winner === away ? 1 : 0;
      stats[away].derrotas += loser === away ? 1 : 0;
      stats[away].empates += empate ? 1 : 0;
      stats[away].totalJogos += 1;
    }

    // Atualizar no Supabase todos os jogadores
    for (const [username, s] of Object.entries(stats)) {
      await supabase.from("inscritos").update(s).eq("username", username);
    }

    console.log("✅ Classificação recalculada com sucesso!");
  }


  renderMatches();
});
