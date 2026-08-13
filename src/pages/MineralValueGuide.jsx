import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Gem, LockKeyhole, Search, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";

const MATERIALS = [
  { name: "Limestone", group: "Carbonate", definition: "Sedimentary carbonate rock composed mainly of calcite; a core feedstock for crushed stone, cement, lime, agricultural lime and industrial fillers.", uses: "Aggregate, cement, lime, ag-lime, fillers", valueTier: "Moderate", value: "Value rises sharply with purity, chemistry, white color, low deleterious minerals, permitted reserves and proximity to market.", drivers: "CaCO₃ purity, Mg content, abrasion, soundness, color, bench thickness, stripping ratio, haul distance" },
  { name: "Dolomite / Dolostone", group: "Carbonate", definition: "Carbonate rock rich in dolomite mineral; used where magnesium chemistry, hardness and durability are commercially useful.", uses: "Aggregate, asphalt stone, glass/flux, lime, agriculture", valueTier: "Moderate–High", value: "Industrial or chemical-grade dolomite can command more than ordinary construction aggregate.", drivers: "MgO/CaO chemistry, silica, hardness, sizing, market access" },
  { name: "Granite", group: "Igneous", definition: "Coarse-grained intrusive igneous rock dominated by quartz and feldspar; valued for durability and appearance.", uses: "Dimension stone, monuments, architectural stone, aggregate", valueTier: "High", value: "Blocks with consistent color, low fracture density and good polishability can be far more valuable than crushed-stone feed.", drivers: "Block size, joint spacing, color, polish, strength, recovery rate, freight" },
  { name: "Basalt", group: "Igneous", definition: "Fine-grained volcanic rock typically rich in pyroxene and plagioclase; commonly dense, strong and abrasion resistant.", uses: "Road stone, rail ballast, asphalt aggregate, rock wool", valueTier: "Moderate–High", value: "Premium applications depend on abrasion resistance, soundness and specification compliance.", drivers: "LA abrasion, absorption, soundness, skid resistance, location" },
  { name: "Trap Rock", group: "Igneous", definition: "Commercial term for dense, dark igneous rocks such as basalt or diabase used as high-quality construction stone.", uses: "Rail ballast, high-spec aggregate, asphalt, concrete", valueTier: "High", value: "Often earns a premium where hard, durable aggregate is scarce near major transportation markets.", drivers: "Abrasion, polishing value, freeze-thaw durability, rail/highway access" },
  { name: "Diabase / Dolerite", group: "Igneous", definition: "Medium-grained mafic intrusive rock compositionally similar to basalt.", uses: "High-strength aggregate, ballast, asphalt", valueTier: "High", value: "Commercial value is tied to mechanical performance and access to specification-driven markets.", drivers: "Strength, abrasion, polish resistance, deposit geometry, logistics" },
  { name: "Rhyolite", group: "Igneous", definition: "Fine-grained felsic volcanic rock chemically similar to granite.", uses: "Aggregate, decorative stone, landscaping", valueTier: "Moderate", value: "Decorative colors and competent rock can increase value above ordinary aggregate uses.", drivers: "Color, durability, fracture pattern, local decorative market" },
  { name: "Sandstone", group: "Sedimentary", definition: "Clastic sedimentary rock composed mainly of sand-sized mineral grains, commonly quartz.", uses: "Dimension stone, flagstone, aggregate, silica feed", valueTier: "Moderate–High", value: "Thin-bedded flagstone, premium color, or high-silica material may command more than ordinary crushed stone.", drivers: "Bed thickness, color, quartz purity, cementation, split quality, freight" },
  { name: "Quartzite", group: "Metamorphic", definition: "Very hard metamorphic rock formed from quartz-rich sandstone.", uses: "High-spec aggregate, railroad ballast, decorative stone, silica", valueTier: "High", value: "High hardness and silica purity can support premium aggregate or industrial applications.", drivers: "SiO₂ purity, abrasion, fracture behavior, iron staining, processing cost" },
  { name: "Marble", group: "Metamorphic", definition: "Recrystallized carbonate rock capable of taking a polish; commercial marble may include some polishable limestones.", uses: "Dimension stone, tile, monuments, fillers, landscaping", valueTier: "Premium", value: "Consistent color, veining, block recovery and polish quality are the main value multipliers.", drivers: "Color/vein pattern, block size, fractures, polish, quarry yield, brand recognition" },
  { name: "Slate", group: "Metamorphic", definition: "Fine-grained metamorphic rock with strong cleavage that allows splitting into thin durable sheets.", uses: "Roofing, flooring, architectural panels, landscaping", valueTier: "High", value: "Roofing-grade slate with reliable cleavage and weather resistance can be a specialty high-value product.", drivers: "Cleavage, absorption, weathering, color stability, slab recovery" },
  { name: "Gneiss", group: "Metamorphic", definition: "Banded high-grade metamorphic rock commonly composed of quartz, feldspar and mica.", uses: "Aggregate, dimension/landscape stone", valueTier: "Moderate–High", value: "Decorative banding and competent block structure can move material into higher-value architectural uses.", drivers: "Banding, fractures, strength, color, block yield" },
  { name: "Schist", group: "Metamorphic", definition: "Foliated metamorphic rock rich in platy minerals such as mica.", uses: "Landscape stone, decorative stone, limited aggregate", valueTier: "Variable", value: "Value depends strongly on appearance and structural competency; foliation can limit engineering uses.", drivers: "Foliation, mica content, durability, appearance, splitting" },
  { name: "Shale", group: "Sedimentary", definition: "Fine-grained sedimentary rock formed from compacted clay and silt.", uses: "Brick, lightweight aggregate, cement raw feed", valueTier: "Low–Moderate", value: "Usually a feedstock business; value improves where chemistry matches nearby cement or ceramic plants.", drivers: "Clay chemistry, bloating behavior, sulfur, overburden, plant proximity" },
  { name: "Clay", group: "Industrial Mineral", definition: "Fine-grained natural material dominated by clay minerals; properties vary widely by mineralogy.", uses: "Brick, tile, ceramics, absorbents, fillers, drilling products", valueTier: "Variable–High", value: "Specialty clays can be much more valuable than common structural clay.", drivers: "Mineralogy, whiteness, plasticity, firing behavior, brightness, contaminants" },
  { name: "Kaolin", group: "Industrial Mineral", definition: "White clay rich in kaolinite, prized for brightness, particle shape and chemical properties.", uses: "Paper/coatings, ceramics, paint, rubber, plastics", valueTier: "High", value: "Brightness, particle size and low iron/titania are major premium drivers.", drivers: "Brightness, Fe/Ti, particle size, viscosity, beneficiation recovery" },
  { name: "Silica Sand", group: "Industrial Mineral", definition: "Sand with a high percentage of quartz; quality requirements vary sharply by end use.", uses: "Glass, foundry, filtration, industrial sand, specialty markets", valueTier: "Moderate–Premium", value: "High-purity, tightly sized, low-iron silica can be worth multiples of ordinary construction sand.", drivers: "SiO₂, Fe₂O₃, grain size/shape, washing yield, logistics" },
  { name: "Gypsum", group: "Industrial Mineral", definition: "Soft sulfate mineral rock composed primarily of calcium sulfate dihydrate.", uses: "Wallboard, cement retarder, agriculture", valueTier: "Moderate", value: "Mine value is usually logistics-sensitive because processed products are relatively bulky.", drivers: "Purity, anhydrite/clay content, stripping ratio, plant proximity" },
  { name: "Barite", group: "Industrial Mineral", definition: "Barium sulfate mineral notable for high specific gravity.", uses: "Oil and gas drilling mud, chemical products, fillers", valueTier: "High", value: "Drilling-grade material depends on specific gravity and contaminant limits.", drivers: "Specific gravity, BaSO₄ content, silica, sizing, API specification" },
  { name: "Fluorite / Fluorspar", group: "Industrial Mineral", definition: "Calcium fluoride mineral used as a source of fluorine and as a metallurgical flux.", uses: "Chemical acids, aluminum, steel flux, specialty products", valueTier: "High–Premium", value: "Acid-grade purity carries substantially more value than lower-grade metallurgical material.", drivers: "CaF₂ grade, silica, sulfur, beneficiation recovery, market access" },
  { name: "Feldspar", group: "Industrial Mineral", definition: "Group of aluminosilicate minerals used primarily for their alkali and alumina content.", uses: "Glass, ceramics, fillers", valueTier: "Moderate–High", value: "Low-iron, consistent chemistry and fine processing support higher-value ceramic and glass markets.", drivers: "K/Na chemistry, iron, particle size, consistency, processing" },
  { name: "Mica", group: "Industrial Mineral", definition: "Sheet silicate minerals with perfect basal cleavage and useful electrical and thermal properties.", uses: "Joint compound, paint, plastics, electrical products", valueTier: "High", value: "Sheet mica and specialty ground products can command much higher prices than mine-run material.", drivers: "Flake size, color, purity, aspect ratio, processing" },
  { name: "Talc", group: "Industrial Mineral", definition: "Very soft magnesium silicate mineral valued for softness, platy shape and chemical inertness.", uses: "Plastics, paint, ceramics, paper, specialty fillers", valueTier: "High", value: "Brightness, purity and particle morphology are key specialty-market value drivers.", drivers: "Brightness, mineral purity, asbestos-free verification, particle morphology" },
  { name: "Phosphate Rock", group: "Industrial Mineral", definition: "Sedimentary or igneous rock enriched in phosphate minerals, principally apatite.", uses: "Fertilizer, phosphoric acid", valueTier: "High", value: "Value depends on P₂O₅ grade, impurities, beneficiation recovery and proximity to processing/export infrastructure.", drivers: "P₂O₅, MgO, Fe/Al, silica, recovery, logistics" },
  { name: "Salt / Halite", group: "Industrial Mineral", definition: "Evaporite mineral composed of sodium chloride.", uses: "Deicing, chlor-alkali chemical feed, food/industrial salt", valueTier: "Moderate", value: "Purity and market channel matter, but transportation cost is often decisive for bulk salt.", drivers: "NaCl purity, moisture, insolubles, mine method, market distance" },
  { name: "Sand & Gravel", group: "Aggregate", definition: "Unconsolidated natural granular deposits processed into construction sand and coarse aggregate.", uses: "Concrete, asphalt, road base, drainage, fill", valueTier: "Moderate", value: "A classic location-driven commodity: permitted reserves close to high-growth markets can carry exceptional land value.", drivers: "Gradation, deleterious material, reserve volume, water table, permits, haul distance" },
  { name: "Crushed Stone", group: "Aggregate", definition: "Manufactured aggregate produced by crushing competent bedrock such as limestone, granite, dolomite or trap rock.", uses: "Concrete, asphalt, road base, railroad, drainage", valueTier: "Moderate", value: "Unit prices may be modest, but high-volume permitted reserves near demand centers can create very large enterprise value.", drivers: "Rock quality, permitted tons, stripping, plant efficiency, market radius, freight" },
];

function csvEscape(v) {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

export default function MineralValueGuide() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("All");
  const [allowed, setAllowed] = useState(user?.role === "admin");
  const [checking, setChecking] = useState(Boolean(user?.id) && user?.role !== "admin");

  React.useEffect(() => {
    if (!user?.id || user?.role === "admin") return;
    (async () => {
      try {
        const rows = await base44.entities.SubscriptionEntitlement.filter({ user_id: user.id }, "-updated_date", 10);
        setAllowed((rows || []).some((e) => ["active", "trial", "grace_period"].includes(e.status) && ["professional_monthly", "professional_annual"].includes(e.plan_code)));
      } catch {
        setAllowed(false);
      } finally {
        setChecking(false);
      }
    })();
  }, [user?.id, user?.role]);

  const groups = useMemo(() => ["All", ...Array.from(new Set(MATERIALS.map((m) => m.group))).sort()], []);
  const filtered = MATERIALS.filter((m) => {
    const q = query.trim().toLowerCase();
    return (group === "All" || m.group === group) && (!q || [m.name, m.group, m.definition, m.uses, m.drivers].join(" ").toLowerCase().includes(q));
  });

  const downloadCsv = () => {
    if (!allowed) return;
    const headers = ["Material", "Group", "Definition", "Commercial uses", "Indicative value tier", "Value profile", "Key value drivers"];
    const rows = MATERIALS.map((m) => [m.name, m.group, m.definition, m.uses, m.valueTier, m.value, m.drivers]);
    const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SS-Mineral-Rock-Value-Guide-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-slate-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-heading font-bold text-foreground">S&amp;S Rock Holdings</Link>
          <div className="text-sm text-muted-foreground">S&amp;S Mineral &amp; Rock Value Guide</div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="rounded-3xl bg-slate-950 p-8 text-white sm:p-10">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-sky-300"><Gem className="h-4 w-4" /> Professional intelligence</div>
          <h1 className="mt-4 max-w-3xl font-heading text-3xl font-bold sm:text-5xl">Mineral &amp; Rock Value Guide</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">A commercial screening guide to quarry stone, aggregates and industrial minerals—what each material is, where it is used, what makes it valuable, and the factors that move a deposit from ordinary rock to a premium resource.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={downloadCsv} disabled={!allowed || checking} className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"><Download className="h-4 w-4" /> Download full value guide</button>
            {!allowed && !checking && <Link to="/subscribe" className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-bold"><LockKeyhole className="h-4 w-4" /> Unlock Professional</Link>}
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Value note:</strong> This guide uses commercial value tiers and value drivers rather than pretending there is one universal price per ton. Actual selling price and in-ground value vary by location, product specification, quality, processing, permits, reserve volume, contract structure and freight. Site-specific S&amp;S Intelligence Reports should use current source-backed market inputs before assigning dollar values.</div>

        <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xl flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search rock, mineral, use or value driver…" className="w-full rounded-xl border border-input bg-card py-3 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring" /></div>
          <div className="flex flex-wrap gap-2">{groups.map((g) => <button key={g} onClick={() => setGroup(g)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${group === g ? "bg-slate-900 text-white" : "border border-border bg-card text-muted-foreground"}`}>{g}</button>)}</div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m) => (
            <article key={m.name} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-sky-700">{m.group}</div><h2 className="mt-1 font-heading text-xl font-bold text-foreground">{m.name}</h2></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-800">{m.valueTier}</span></div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">{m.definition}</p>
              <div className="mt-4 border-t border-border pt-4"><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Commercial uses</div><p className="mt-1 text-sm text-foreground">{m.uses}</p></div>
              {allowed ? <><div className="mt-4"><div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> Value profile</div><p className="mt-1 text-sm leading-6 text-foreground">{m.value}</p></div><div className="mt-4"><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">What moves value</div><p className="mt-1 text-sm leading-6 text-foreground">{m.drivers}</p></div></> : <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground"><LockKeyhole className="mb-2 h-4 w-4" />Professional members see the commercial value profile and key value drivers for every material.</div>}
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
