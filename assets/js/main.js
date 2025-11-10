// ===============================
// 🔗 CONFIGURAÇÃO SUPABASE
// ===============================
import { createClient } from "https://esm.sh/@supabase/supabase-js";

export const supabase = createClient(
  "https://kegcayfjncmsvivnwpfk.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlZ2NheWZqbmNtc3Zpdm53cGZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NzU1NzAsImV4cCI6MjA3ODA1MTU3MH0.YN4TxNOSI2jVUWifMMFuG6EbTcCbHpZStUp4OH7f_V8"
);

// ===============================
// 🌙 TEMA (Modo Claro / Escuro)
// ===============================
export function setupThemeToggle() {
  const btn = document.getElementById("themeToggle");
  const savedTheme = localStorage.getItem("theme");

  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    if (btn) btn.textContent = "☀️";
  }

  btn?.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark-mode");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    btn.textContent = isDark ? "☀️" : "🌙";
  });
}

// ===============================
// 🧾 FUNÇÕES DE INSCRITOS
// ===============================

// Obter todos os inscritos da tabela
export async function getInscritos() {
  const { data, error } = await supabase.from("inscritos").select("*").order("username", { ascending: true });
  if (error) {
    console.error("Erro ao buscar inscritos:", error);
    return [];
  }
  return data || [];
}

// Guardar novo inscrito
export async function saveInscrito(inscrito) {
  const { data, error } = await supabase.from("inscritos").insert([inscrito]);
  if (error) {
    console.error("❌ Erro ao guardar inscrito:", error.message, error.details);
    alert("Erro Supabase: " + error.message);
    return { error };
  }
  console.log("✅ Inserido com sucesso:", data);
  return { data };
}

// ---------- ATUALIZA ESTATÍSTICAS DE UM JOGADOR ----------
export async function updateStats(username, updateData) {
  // Primeiro busca os dados atuais
  const { data: current, error: getError } = await supabase
    .from("inscritos")
    .select("*")
    .eq("username", username)
    .single();

  if (getError) {
    console.error("Erro ao buscar jogador:", getError.message);
    return;
  }

  if (!current) {
    console.warn(`⚠️ Jogador ${username} não encontrado na tabela 'inscritos'`);
    return;
  }

  // Calcula novos valores incrementais
  const novos = {
    golosMarcados: (current.golosMarcados || 0) + (updateData.golosMarcados || 0),
    golosSofridos: (current.golosSofridos || 0) + (updateData.golosSofridos || 0),
    vitorias: (current.vitorias || 0) + (updateData.vitorias || 0),
    derrotas: (current.derrotas || 0) + (updateData.derrotas || 0),
    empates: (current.empates || 0) + (updateData.empates || 0),
    totalJogos: (current.totalJogos || 0) + (updateData.totalJogos || 0)
  };

  // Atualiza no Supabase
  const { error: updateError } = await supabase
    .from("inscritos")
    .update(novos)
    .eq("username", username);

  if (updateError) {
    console.error("Erro ao atualizar stats:", updateError.message);
  } else {
    console.log(`✅ Estatísticas de ${username} atualizadas com sucesso.`);
  }
}

// Apagar um inscrito (se necessário, via admin)
export async function deleteInscrito(username) {
  const { error } = await supabase.from("inscritos").delete().eq("username", username);
  if (error) console.error("Erro ao apagar inscrito:", error);
}

// ===============================
// 🧩 FUNÇÕES DE BRACKETS
// ===============================
export async function getBrackets() {
  const { data, error } = await supabase.from("brackets").select("*").single();
  if (error) {
    console.error("Erro ao buscar brackets:", error);
    return null;
  }
  return data?.data || null;
}

export async function saveBrackets(bracketData) {
  // Limpa os brackets antigos e insere o novo
  await supabase.from("brackets").delete().neq("id", "");
  const { error } = await supabase.from("brackets").insert([{ data: bracketData }]);
  if (error) console.error("Erro ao guardar brackets:", error);
}

// ===============================
// 🧠 UTILITÁRIO GLOBAL
// ===============================
export function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}


// ===============================
// ⚑ ESTADO DO TORNEIO (fase regular concluída)
// ===============================
export async function getTournamentState() {
  // Lê a ÚNICA linha da tabela torneio_estado; se não existir, cria-a (false)
  const { data, error } = await supabase
    .from("torneio_estado")
    .select("id,fase_regular_concluida")
    .limit(1)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("getTournamentState:", error);
    return false;
  }
  if (!data) {
    const { error: insErr } = await supabase
      .from("torneio_estado")
      .insert([{ fase_regular_concluida: false }]);
    if (insErr) console.error("init torneio_estado:", insErr);
    return false;
  }
  return !!data.fase_regular_concluida;
}

export async function setTournamentState(finished) {
  // Garante que há 1 linha; atualiza-a
  const { data } = await supabase
    .from("torneio_estado")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (data) {
    const { error } = await supabase
      .from("torneio_estado")
      .update({ fase_regular_concluida: !!finished })
      .eq("id", data.id);
    if (error) console.error("setTournamentState:", error);
  } else {
    const { error } = await supabase
      .from("torneio_estado")
      .insert([{ fase_regular_concluida: !!finished }]);
    if (error) console.error("setTournamentState insert:", error);
  }
}

// Atualizações em tempo-real do estado
export function onTournamentStateChange(cb) {
  return supabase
    .channel("estado-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "torneio_estado" }, cb)
    .subscribe();
}

// ===============================
// 🧮 Ranking util (pontos / desempates)
// ===============================
export function computeRanking(inscritos) {
  const rows = (inscritos || []).map(p => {
    const v = p.vitorias || 0;
    const e = p.empates || 0;
    const d = p.derrotas || 0;
    const gm = p.golosMarcados || 0;
    const gs = p.golosSofridos || 0;
    const pontos = 3*v + 1*e;
    const dg = gm - gs;
    return {
      username: p.username || "—",
      equipa: p.equipa || "—",
      v, e, d, gm, gs, dg, pontos
    };
  });

  rows.sort((a, b) =>
    b.pontos - a.pontos ||
    b.dg - a.dg ||
    b.gm - a.gm ||
    a.username.localeCompare(b.username)
  );
  return rows;
}

// ===============================
// 🔒 Bloquear/Desbloquear o link dos Playoffs no header
// ===============================
export async function lockPlayoffsNavUntilFinished() {
  const done = await getTournamentState();
  const nav = document.querySelector("nav");
  if (!nav) return;
  const playoffsLink = [...nav.querySelectorAll("a")].find(a => /brackets\.html$/i.test(a.href) || a.getAttribute("href")==="brackets.html");
  if (!playoffsLink) return;

  if (!done) {
    playoffsLink.classList.add("nav-disabled");
    playoffsLink.setAttribute("title", "Disponível após terminar a época regular");
    playoffsLink.addEventListener("click", (e) => {
      e.preventDefault();
      alert("⚠️ Os Playoffs só ficam disponíveis depois de terminares a época regular.");
    }, { once: true });
  } else {
    playoffsLink.classList.remove("nav-disabled");
    playoffsLink.removeAttribute("title");
  }
}


// ===============================
// 👤 ROLE DROPDOWN (Guest / Admin)
// ===============================
export const ADMIN_PASSWORD = "admin123"; // <— podes mudar aqui

export function setupRoleDropdown() {
  const dropdown = document.getElementById("roleDropdown");
  const icon = document.getElementById("roleIcon");
  if (!dropdown || !icon) return;

  // Aplica role guardada
  const savedRole = sessionStorage.getItem("userRole") || "guest";
  dropdown.value = savedRole;
  updateRoleIcon(savedRole);
  if (savedRole === "admin") document.body.classList.add("admin-mode");


  // Mudança manual via dropdown
  dropdown.addEventListener("change", () => changeRole(dropdown.value));

  // Atalho Ctrl + A
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      changeRole("admin");
    }
  });

  function changeRole(role) {
    if (role === "admin") {
      const pwd = prompt("Password de administrador:");
      if (pwd === ADMIN_PASSWORD) {
        sessionStorage.setItem("userRole", "admin");
        dropdown.value = "admin";
        updateRoleIcon("admin");
        document.body.classList.add("admin-mode");
        alert("Modo administrador ativado ✅");
        location.reload(); // 🔁 força reload da página
      } else {
        alert("Password incorreta ❌");
        dropdown.value = "guest";
        sessionStorage.setItem("userRole", "guest");
        updateRoleIcon("guest");
        document.body.classList.remove("admin-mode");
        location.reload(); // 🔁 reload mesmo ao falhar
      }
    } else {
      sessionStorage.setItem("userRole", "guest");
      updateRoleIcon("guest");
      document.body.classList.remove("admin-mode");
      alert("Modo visitante ativo 👤");
      location.reload(); 
    }
  }


}

function updateRoleIcon(role) {
  const icon = document.getElementById("roleIcon");
  if (!icon) return;

  if (role === "admin") {
    icon.textContent = "⭐"; 
    icon.style.color = "#facc15"; 
  } else {
    icon.textContent = "👤";
    icon.style.color = "var(--text-color)"; 
  }
}


export function isAdmin() {
  return sessionStorage.getItem("userRole") === "admin";
}

