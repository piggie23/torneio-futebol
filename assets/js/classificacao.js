import { getInscritos, supabase } from "./main.js";
import { setupThemeToggle, setupRoleDropdown } from "./main.js";

setupThemeToggle();
setupRoleDropdown();

document.addEventListener("DOMContentLoaded", async () => {
  const tbody = document.querySelector("#tabelaClassificacao tbody");

  async function renderClassificacao() {
    const inscritos = await getInscritos();
    tbody.innerHTML = "";

    if (!inscritos || inscritos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11">Sem dados de classificação.</td></tr>`;
      return;
    }

    const ranking = inscritos.map((p) => {
      const v = p.vitorias || 0;
      const d = p.derrotas || 0;
      const e = p.empates || 0;
      const gm = p.golosMarcados || 0;
      const gs = p.golosSofridos || 0;
      const jj = p.totalJogos || (v + d + e); // fallback
      const dg = gm - gs;
      const pontos = v * 3 + e * 1;

      return {
        username: p.username || "—",
        equipa: p.equipa || "—",
        jj,
        v,
        e,
        d,
        gm,
        gs,
        dg,
        pontos,
      };
    });

    // Ordenar: Pontos > Diferença de Golos > Golos Marcados
    ranking.sort((a, b) =>
      b.pontos - a.pontos ||
      (b.dg - a.dg) ||
      (b.gm - a.gm)
    );

    let q = 8;
    if (ranking.length < 8) q = ranking.length >= 4 ? 4 : 2;

    ranking.forEach((r, i) => {
      const tr = document.createElement("tr");

      if (i === 0) tr.style.background = "rgba(255, 215, 0, 0.15)";          // ouro
      else if (i === 1) tr.style.background = "rgba(192,192,192,0.15)";     // prata
      else if (i === 2) tr.style.background = "rgba(205,127,50,0.15)";      // bronze

     

      tr.innerHTML = `
        <td class="pos-cell">
          <span class="pos-number">${i + 1}</span>
          <span class="qualificado-icon">${i < q ? "★" : ""}</span>
        </td>
        <td>${r.username}</td>
        <td>${r.equipa}</td>
        <td>${r.jj}</td>
        <td>${r.v}</td>
        <td>${r.e}</td>
        <td>${r.d}</td>
        <td>${r.gm}</td>
        <td>${r.gs}</td>
        <td>${r.dg}</td>
        <td>${r.pontos}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  await renderClassificacao();

  document.getElementById("tabelaWrapper")?.insertAdjacentHTML("beforeend", `
    <div class="legenda-classificacao">
      <span class="legenda-star">★</span> Qualificado para os Playoffs
    </div>
  `);

  // Atualiza quando muda "inscritos" (stats por jogador)
  supabase
    .channel("inscritos-updates")
    .on("postgres_changes", { event: "*", schema: "public", table: "inscritos" }, renderClassificacao)
    .subscribe();

  // E também quando muda "matches" (resultado de jogos)
  supabase
    .channel("matches-updates")
    .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, renderClassificacao)
    .subscribe();
});
