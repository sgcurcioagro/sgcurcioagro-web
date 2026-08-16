const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let relatorios = [];
let relatorioAtivo = null;
let map = null;
let imageOverlay = null;
let chartInstance = null;
let urlImagemAtual = null; // pra liberar memória (URL.revokeObjectURL) ao trocar

const telaLogin = document.getElementById("tela-login");
const appEl = document.getElementById("app");

// ===================== LOGIN =====================

document.getElementById("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  const erroEl = document.getElementById("login-erro");
  erroEl.textContent = "";

  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error) {
    erroEl.textContent = "E-mail ou senha incorretos.";
    return;
  }

  iniciarApp();
});

document.getElementById("btn-sair").addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.reload();
});

async function verificarSessao() {
  const { data } = await supabase.auth.getSession();

  if (data.session) {
    iniciarApp();
  } else {
    telaLogin.style.display = "flex";
    appEl.style.display = "none";
  }
}

// ===================== APP =====================

async function iniciarApp() {
  telaLogin.style.display = "none";
  appEl.style.display = "grid";

  await carregarRelatorios();
}

async function carregarRelatorios() {
  const { data, error } = await supabase
    .from("relatorios")
    .select("*, lavouras(nome)")
    .order("criado_em", { ascending: false });

  if (error) {
    document.getElementById("main-content").innerHTML =
      `<div class="empty-state">Erro ao carregar relatórios: ${error.message}</div>`;
    return;
  }

  relatorios = data;
  renderizarLista();

  if (relatorios.length > 0) {
    selecionarRelatorio(relatorios[0].id);
  }
}

function renderizarLista() {
  const lista = document.getElementById("relatorios-list");
  lista.innerHTML = "";

  if (relatorios.length === 0) {
    lista.innerHTML = `<div class="nav-empty">Nenhum relatório ainda.</div>`;
    return;
  }

  relatorios.forEach((r) => {
    const item = document.createElement("div");
    item.className = "module-item" + (relatorioAtivo && relatorioAtivo.id === r.id ? " active" : "");
    item.innerHTML = `<span class="dot"></span>${r.label}`;
    item.addEventListener("click", () => selecionarRelatorio(r.id));
    lista.appendChild(item);
  });
}

async function selecionarRelatorio(id) {
  const r = relatorios.find((item) => item.id === id);
  if (!r) return;

  relatorioAtivo = r;
  renderizarLista();

  const main = document.getElementById("main-content");
  main.innerHTML = `
    <div class="report-header">
      <div class="eyebrow">${r.lavouras ? r.lavouras.nome : ""} · ${r.data_exibicao}</div>
      <h1>${r.modulo.toUpperCase()}</h1>
    </div>

    <div class="kpi-row">
      <div class="kpi-card highlight"><div class="kpi-label">Média</div><div class="kpi-value">${r.media ?? "--"}</div></div>
      <div class="kpi-card"><div class="kpi-label">Mínimo / Máximo</div><div class="kpi-value small">${r.minimo ?? "--"} / ${r.maximo ?? "--"}</div></div>
      <div class="kpi-card"><div class="kpi-label">Desvio Padrão</div><div class="kpi-value small">${r.desvio ?? "--"}</div></div>
    </div>

    <div class="map-and-side">
      <div id="map" class="map-box"></div>
      <div class="side-panel">
        <div class="panel-box">
          <h3>Inspetor de Pixel</h3>
          <p class="instruction" id="probe-instruction">Clique no mapa para inspecionar</p>
          <div class="probe-data" id="probe-data" style="display:none">
            <div class="probe-row"><span>Coordenadas</span><strong id="probe-coords">--</strong></div>
            <div class="probe-row"><span>Valor</span><strong id="probe-value">--</strong></div>
          </div>
        </div>
        <div class="panel-box">
          <h3>Distribuição</h3>
          <div class="chart-container"><canvas id="histogram-chart"></canvas></div>
        </div>
      </div>
    </div>
  `;

  await renderizarMapa(r);
  renderizarHistograma(r);
}

async function renderizarMapa(r) {

  if (map) {
    map.remove();
    map = null;
  }

  map = L.map("map").setView([-14.2, -51.9], 4);

  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    attribution: "Tiles &copy; Esri"
  }).addTo(map);

  if (imageOverlay) {
    map.removeLayer(imageOverlay);
    imageOverlay = null;
  }

  if (urlImagemAtual) {
    URL.revokeObjectURL(urlImagemAtual);
    urlImagemAtual = null;
  }

  const { data: blob, error } = await supabase.storage.from("mapas").download(r.png_path);

  if (error) {
    console.error("Erro ao baixar imagem:", error.message);
    return;
  }

  urlImagemAtual = URL.createObjectURL(blob);

  const b = r.bounds; // [minx, miny, maxx, maxy] em lon/lat
  const bounds = [[b[1], b[0]], [b[3], b[2]]];

  imageOverlay = L.imageOverlay(urlImagemAtual, bounds, { opacity: 0.85 }).addTo(map);
  map.fitBounds(bounds);

  map.off("click");
  map.on("click", (e) => inspecionarPixel(e, r));
}

function inspecionarPixel(e, r) {

  const grid = r.grid_data;
  if (!grid) return;

  const lat = e.latlng.lat;
  const lng = e.latlng.lng;
  const b = r.bounds;

  if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) {
    document.getElementById("probe-data").style.display = "none";
    document.getElementById("probe-instruction").style.display = "block";
    return;
  }

  const normX = (lng - b[0]) / (b[2] - b[0]);
  const normY = (b[3] - lat) / (b[3] - b[1]);

  const px = Math.floor(normX * r.largura);
  const py = Math.floor(normY * r.altura);

  if (py < 0 || py >= grid.length || px < 0 || px >= grid[py].length) return;

  const valor = grid[py][px];

  document.getElementById("probe-data").style.display = "block";
  document.getElementById("probe-instruction").style.display = "none";
  document.getElementById("probe-coords").textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  document.getElementById("probe-value").textContent =
    valor === -9999 ? "Sem dado" : valor.toFixed(4);
}

function renderizarHistograma(r) {

  const ctx = document.getElementById("histogram-chart").getContext("2d");

  if (chartInstance) {
    chartInstance.destroy();
  }

  if (!r.bin_edges || !r.histograma) return;

  const labels = r.bin_edges.slice(0, -1).map((v) => v.toFixed(2));

  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Pixels",
        data: r.histograma,
        backgroundColor: "rgba(201, 162, 39, 0.55)",
        borderColor: "rgba(201, 162, 39, 1)",
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { display: false },
        x: { ticks: { color: "#8a9a8d", font: { size: 10 } }, grid: { display: false } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

verificarSessao();
