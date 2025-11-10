import { getInscritos, deleteInscrito, updateStats, supabase } from "./main.js";
import { setupThemeToggle, setupRoleDropdown, isAdmin } from "./main.js";

setupThemeToggle();
setupRoleDropdown();

document.addEventListener("DOMContentLoaded", async () => {
  const tabela = document.getElementById("tabelaInscritos");
  const tbody = tabela.querySelector("tbody");
  const adminBtn = document.getElementById("adminLogin");
  const adminMsg = document.getElementById("adminMsg");

  // ---------- FUNÇÃO DE RENDERIZAÇÃO ----------
  async function renderInscritos() {
    const inscritos = await getInscritos();
    tbody.innerHTML = "";

    if (!inscritos || inscritos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">Sem inscrições no momento.</td></tr>`;
      return;
    }

    inscritos.forEach((p) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${p.username}</td>
        <td>${p.plataforma}</td>
        <td>${p.equipa}</td>
        <td>${p.dias ? (Array.isArray(p.dias) ? p.dias.join(", ") : p.dias) : "—"}</td>
        <td>${p.horario || "—"}</td>
        ${
          isAdmin()
            ? `<td class="adminOnly">
                <button class="editar" data-id="${p.id}">✏️</button>
                <button class="apagar" data-id="${p.id}">🗑️</button>
              </td>`
            : ""
        }
      `;
      tbody.appendChild(row);
    });
  }

  // ---------- BOTÕES DE AÇÃO ----------
  tbody.addEventListener("click", async (e) => {
    if (!isAdmin()) return;
    const id = e.target.dataset.id;
    if (!id) return;

    // 🗑️ Apagar
    if (e.target.classList.contains("apagar")) {
      if (confirm("Tens a certeza que queres remover este inscrito?")) {
        const { error } = await supabase.from("inscritos").delete().eq("id", id);
        if (error) console.error(error);
        else alert("Inscrito removido.");
        renderInscritos();
      }
    }

    // ✏️ Editar
    if (e.target.classList.contains("editar")) {
      const novoNome = prompt("Novo username:", "");
      const novaEquipa = prompt("Nova equipa:", "");
      const novaPlataforma = prompt("Nova plataforma:", "");
      const vitorias = parseInt(prompt("Vitórias (número):") || "0");
      const derrotas = parseInt(prompt("Derrotas (número):") || "0");
      const golosMarcados = parseInt(prompt("Golos marcados:") || "0");
      const golosSofridos = parseInt(prompt("Golos sofridos:") || "0");

      const { error } = await supabase
        .from("inscritos")
        .update({
          username: novoNome,
          equipa: novaEquipa,
          plataforma: novaPlataforma,
          vitorias,
          derrotas,
          golosMarcados,
          golosSofridos,
        })
        .eq("id", id);

      if (error) console.error(error);
      else alert("Inscrito atualizado ✅");
      renderInscritos();
    }
  });

  // ---------- LIVE UPDATE ----------
  supabase
    .channel("inscritos-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "inscritos" }, renderInscritos)
    .subscribe();

  renderInscritos();
});

