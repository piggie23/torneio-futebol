// ======================================================
// form.js — versão Supabase integrada (ajustada)
// ======================================================

import { saveInscrito, getInscritos, setupThemeToggle } from "./main.js";

setupThemeToggle();


// ---------- Função para gerar opções de horas ----------
function gerarOpcoesHoras(selectId) {
  const select = document.getElementById(selectId);
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 30]) {
      const hora = String(h).padStart(2, "0");
      const min = String(m).padStart(2, "0");
      const valor = `${hora}:${min}`;
      const opt = document.createElement("option");
      opt.value = valor;
      opt.textContent = valor;
      select.appendChild(opt);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  gerarOpcoesHoras("horaInicio");
  gerarOpcoesHoras("horaFim");

  // ======================================================
  //   MODAL DE INSCRIÇÃO (mover para dentro do DOMContentLoaded)
  // ======================================================
  const formDialog = document.getElementById("formDialog");
  const openFormBtn = document.getElementById("openForm");

  if (openFormBtn && formDialog) {
    openFormBtn.addEventListener("click", () => {
      if (!formDialog.open) formDialog.showModal();
    });

    formDialog.addEventListener("click", (e) => {
      const rect = formDialog.getBoundingClientRect();
      const dentro =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;
      if (!dentro) formDialog.close();
    });
  }

  // ======================================================
  //   SUBMISSÃO DO FORMULÁRIO
  // ======================================================
  const form = document.getElementById("formInscricao");
  const msg = document.getElementById("mensagem");

  form.addEventListener("submit", async (e) => {
    console.log("🟢 Submissão iniciada");
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const plataforma = document.getElementById("plataforma").value;
    const liga = document.getElementById("liga").value;
    const equipa = document.getElementById("equipa").value;

    if (!liga || !equipa) {
      msg.textContent = "Escolhe a liga e a equipa.";
      msg.style.color = "red";
      return;
    }

    const diasSelecionados = Array.from(
      document.querySelectorAll('input[name="dias"]:checked')
    ).map(el => el.value);

    const horaInicio = document.getElementById("horaInicio").value;
    const horaFim = document.getElementById("horaFim").value;

    if (!username || !plataforma || !equipa) {
      msg.textContent = "Preenche todos os campos obrigatórios!";
      msg.style.color = "red";
      return;
    }

    // Criação do objeto para guardar
    const inscrito = {
      username,
      plataforma,
      liga,
      equipa,
      dias: diasSelecionados,
      horario: horaInicio && horaFim ? `${horaInicio} - ${horaFim}` : "Sem horário definido",
      vitorias: 0,
      derrotas: 0,
      golosMarcados: 0,
      golosSofridos: 0
    };

    try {
      console.log("Enviando inscrito:", inscrito);
      await saveInscrito(inscrito);
      equipasJaEscolhidas.add(equipa);

      msg.textContent = "Inscrição enviada com sucesso!";
      msg.style.color = "green";

      setTimeout(() => {
        formDialog.close();
      }, 1200);
    } catch (error) {
      console.error("Erro ao gravar inscrição:", error);
      msg.textContent = "Erro ao enviar inscrição.";
      msg.style.color = "red";
    }
  });

  // ======================================================
  //   LIGAS E EQUIPAS (teams.json)
  // ======================================================
  const ligaSel   = document.getElementById("liga");
  const equipaSel = document.getElementById("equipa");
  const avisoDup  = document.getElementById("equipaAviso");

  let TEAMS = {}; // { "Liga": ["Equipa1", ...] }
  let equipasJaEscolhidas = new Set();

  async function carregarLigasEquipas() {
    try {
      const res = await fetch("data/teams.json", { cache: "no-store" });
      TEAMS = await res.json();

      ligaSel.innerHTML = `
        <option value="">Seleciona uma liga...</option>
        ${Object.keys(TEAMS).sort().map(l => `<option value="${l}">${l}</option>`).join("")}
      `;

      equipaSel.innerHTML = `<option value="">Seleciona primeiro a liga...</option>`;

      // 👉 Recarrega equipas ocupadas a partir do Supabase
      const inscritos = await getInscritos();
      equipasJaEscolhidas.clear();
      inscritos.forEach(p => {
        if (p?.liga && p?.equipa) {
          equipasJaEscolhidas.add(`${p.liga}::${p.equipa}`);
        }
      });
    } catch (e) {
      console.error("Erro a carregar teams.json", e);
    }
  }

  // Quando muda a liga → atualizar lista de equipas
  ligaSel?.addEventListener("change", () => {
    const liga = ligaSel.value;
    const equipas = TEAMS[liga] || [];

    equipaSel.innerHTML = `
      <option value="">Seleciona a equipa...</option>
      ${equipas.map(eq => {
        const ocupada = equipasJaEscolhidas.has(`${liga}::${eq}`);
        return `<option value="${eq}" ${ocupada ? "disabled" : ""}>
                  ${eq}${ocupada ? " (ocupada)" : ""}
                </option>`;
      }).join("")}
    `;
    avisoDup.style.display = "none";
  });

  // Executar carregamento inicial
  carregarLigasEquipas();
});
