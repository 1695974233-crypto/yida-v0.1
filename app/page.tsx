"use client";

import { ChangeEvent, useMemo, useState } from "react";

type Tab = "today" | "wardrobe" | "discover" | "profile";
type Garment = {
  id: number;
  name: string;
  category: string;
  color: string;
  colorName: string;
  meta: string;
  dirty?: boolean;
  image?: string;
};

const initialGarments: Garment[] = [
  { id: 1, name: "燕麦色针织衫", category: "上衣", color: "#d9c8ad", colorName: "燕麦色", meta: "柔软 · 15—22℃" },
  { id: 2, name: "浅蓝条纹衬衫", category: "上衣", color: "#b8cbd4", colorName: "浅蓝", meta: "通勤 · 春秋" },
  { id: 3, name: "奶油白风衣", category: "外套", color: "#e7ddca", colorName: "奶油白", meta: "防风 · 小雨" },
  { id: 4, name: "深灰直筒裤", category: "下装", color: "#595b5c", colorName: "深灰", meta: "利落 · 通勤" },
  { id: 5, name: "蓝色直筒牛仔裤", category: "下装", color: "#66819b", colorName: "牛仔蓝", meta: "休闲 · 百搭" },
  { id: 6, name: "黑色乐福鞋", category: "鞋子", color: "#242321", colorName: "黑色", meta: "舒适 · 通勤" },
  { id: 7, name: "白色运动鞋", category: "鞋子", color: "#eeeae2", colorName: "米白", meta: "轻便 · 日常" },
  { id: 8, name: "雾粉半身裙", category: "下装", color: "#d6aaa6", colorName: "雾粉", meta: "温柔 · 约会", dirty: true },
];

const outfitSets = [
  {
    title: "雨天也清爽",
    tag: "最适合今天",
    score: 96,
    colors: ["#b8cbd4", "#595b5c", "#e7ddca", "#242321"],
    items: "条纹衬衫 · 深灰直筒裤 · 奶油白风衣 · 黑色乐福鞋",
    reason: "风衣应对小雨，裤装利落不拖沓。浅蓝与奶油白让阴天看起来更清爽。",
  },
  {
    title: "舒服不费力",
    tag: "轻松日常",
    score: 91,
    colors: ["#d9c8ad", "#66819b", "#eeeae2"],
    items: "燕麦色针织衫 · 蓝色直筒牛仔裤 · 白色运动鞋",
    reason: "适合今天的温度，步行也舒服。是你常选的低饱和配色。",
  },
  {
    title: "通勤有一点变化",
    tag: "风格探索",
    score: 87,
    colors: ["#d9c8ad", "#595b5c", "#e7ddca", "#eeeae2"],
    items: "燕麦色针织衫 · 深灰直筒裤 · 奶油白风衣 · 白色运动鞋",
    reason: "保留通勤的利落感，用运动鞋降低正式度，适合没有明确场景的一天。",
  },
];

const scenes = ["上班", "约会", "休闲", "运动"];
const styleChoices = ["简约通勤", "温柔松弛", "清爽休闲", "法式复古", "街头感"];

function GarmentArt({ garment, compact = false }: { garment: Garment; compact?: boolean }) {
  if (garment.image) {
    return <img className="garment-photo" src={garment.image} alt={garment.name} />;
  }
  return (
    <div className={`garment-art ${compact ? "compact" : ""}`} style={{ background: garment.color }} aria-hidden="true">
      <span className={`clothing-shape ${garment.category === "下装" ? "bottom" : garment.category === "鞋子" ? "shoe" : garment.category === "外套" ? "coat" : "top"}`} />
    </div>
  );
}

export default function Home() {
  const [onboarding, setOnboarding] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [tab, setTab] = useState<Tab>("today");
  const [scene, setScene] = useState<string | null>(null);
  const [styles, setStyles] = useState<string[]>(["简约通勤", "清爽休闲"]);
  const [garments, setGarments] = useState(initialGarments);
  const [wardrobeFilter, setWardrobeFilter] = useState("全部");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState("上衣");
  const [newColor, setNewColor] = useState("米白");
  const [liked, setLiked] = useState<number[]>([]);
  const [saved, setSaved] = useState<number[]>([1]);
  const [worn, setWorn] = useState<number[]>([]);
  const [rotation, setRotation] = useState(0);
  const [toast, setToast] = useState("");

  const availableCount = garments.filter((item) => !item.dirty).length;
  const filteredGarments = useMemo(
    () => garments.filter((item) => wardrobeFilter === "全部" || (wardrobeFilter === "脏衣篓" ? item.dirty : item.category === wardrobeFilter)),
    [garments, wardrobeFilter],
  );
  const outfits = useMemo(() => [...outfitSets.slice(rotation), ...outfitSets.slice(0, rotation)], [rotation]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function toggleStyle(value: string) {
    setStyles((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function toggleDirty(id: number) {
    setGarments((current) => current.map((item) => item.id === id ? { ...item, dirty: !item.dirty } : item));
    const item = garments.find((garment) => garment.id === id);
    showToast(item?.dirty ? "已恢复到可用衣柜" : "已放入脏衣篓，3 天内不再推荐");
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setUploadPreview(URL.createObjectURL(file));
  }

  function saveGarment() {
    setGarments((current) => [
      { id: Date.now(), name: `${newColor}${newCategory}`, category: newCategory, color: "#d8d0c2", colorName: newColor, meta: "AI 识别 · 待完善", image: uploadPreview ?? undefined },
      ...current,
    ]);
    setUploadOpen(false);
    setUploadPreview(null);
    setTab("wardrobe");
    showToast("衣服已加入你的衣柜");
  }

  function navTo(next: Tab) {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="app-shell">
      {onboarding && (
        <div className="onboarding">
          <div className="onboarding-brand"><span className="brand-mark">易</span><span>易搭</span></div>
          {onboardingStep === 0 && (
            <section className="onboarding-panel intro-panel">
              <div className="intro-visual" aria-hidden="true">
                <div className="closet-rail" />
                <span className="hanging-piece piece-one" />
                <span className="hanging-piece piece-two" />
                <span className="hanging-piece piece-three" />
                <div className="sparkle sparkle-one">✦</div><div className="sparkle sparkle-two">✦</div>
              </div>
              <p className="eyebrow">每天少纠结一点</p>
              <h1>衣服很多，<br />今天穿什么？</h1>
              <p className="lead">易搭会结合天气、可用衣服和你的偏好，从现有衣柜里直接选出今天能穿的搭配。</p>
              <button className="primary-button" onClick={() => setOnboardingStep(1)}>开始认识你 <span>→</span></button>
              <button className="text-button" onClick={() => setOnboarding(false)}>跳过，查看演示衣柜</button>
            </section>
          )}
          {onboardingStep === 1 && (
            <section className="onboarding-panel preference-panel">
              <div className="step-line"><span className="active" /><span /><span /></div>
              <p className="eyebrow">先从感觉开始</p>
              <h2>你平时更喜欢<br />哪种穿衣感觉？</h2>
              <p className="supporting">可以多选，以后随时能修改。</p>
              <div className="style-grid">
                {styleChoices.map((item, index) => (
                  <button key={item} className={`style-choice choice-${index + 1} ${styles.includes(item) ? "selected" : ""}`} onClick={() => toggleStyle(item)}>
                    <span className="style-swatch" /><span>{item}</span>{styles.includes(item) && <b>✓</b>}
                  </button>
                ))}
              </div>
              <button className="primary-button" disabled={!styles.length} onClick={() => setOnboardingStep(2)}>下一步 <span>→</span></button>
            </section>
          )}
          {onboardingStep === 2 && (
            <section className="onboarding-panel ready-panel">
              <div className="step-line"><span className="active" /><span className="active" /><span className="active" /></div>
              <div className="weather-orb"><span>☔</span><strong>22°</strong><small>上海 · 小雨</small></div>
              <p className="eyebrow">准备好了</p>
              <h2>今天的第一套，<br />已经为你搭好</h2>
              <p className="lead">当前使用 8 件演示单品。之后上传真实衣服，推荐会越来越像你。</p>
              <button className="primary-button" onClick={() => setOnboarding(false)}>进入易搭 <span>→</span></button>
              <button className="text-button" onClick={() => setOnboardingStep(1)}>返回修改偏好</button>
            </section>
          )}
        </div>
      )}

      <header className="topbar">
        <button className="logo" onClick={() => navTo("today")} aria-label="返回今日推荐"><span className="brand-mark">易</span><span>易搭</span></button>
        <div className="top-actions"><button className="icon-button" aria-label="消息">♡</button><button className="avatar" onClick={() => navTo("profile")} aria-label="个人中心">晚</button></div>
      </header>

      {tab === "today" && (
        <section className="screen today-screen">
          <div className="greeting-row">
            <div><p className="date-label">8 月 17 日 · 星期一</p><h1>晚上好，晚晚</h1></div>
            <div className="weather-pill"><span>☔</span><div><strong>22℃</strong><small>小雨 · 上海</small></div></div>
          </div>

          <div className="context-card">
            <div><span className="status-dot" />定位天气已更新</div>
            <p>18—25℃，体感微凉，出门建议带一件轻薄外套。</p>
          </div>

          <div className="section-heading">
            <div><p className="eyebrow">可选，不选也能推荐</p><h2>今天准备去哪里？</h2></div>
            {scene && <button className="clear-button" onClick={() => setScene(null)}>清除</button>}
          </div>
          <div className="scene-row">
            {scenes.map((item) => <button key={item} className={scene === item ? "scene-chip selected" : "scene-chip"} onClick={() => setScene(scene === item ? null : item)}>{item === "上班" ? "▣" : item === "约会" ? "♡" : item === "休闲" ? "☕" : "◌"}<span>{item}</span></button>)}
            <button className="scene-chip" onClick={() => showToast("以后可以用一句话描述自定义场景")}><span className="plus">＋</span><span>其他</span></button>
          </div>

          <div className="recommendation-heading">
            <div><p className="eyebrow">{scene ? `已加入“${scene}”场景` : "天气 + 可用衣物 + 你的偏好"}</p><h2>今天为你搭好了</h2></div>
            <button className="refresh-button" onClick={() => { setRotation((rotation + 1) % outfitSets.length); showToast("已经换了一组顺序"); }}>↻ 换一组</button>
          </div>

          <div className="outfit-stack">
            {outfits.map((outfit, index) => {
              const originalIndex = outfitSets.indexOf(outfit);
              return (
                <article className={`outfit-card outfit-${index + 1}`} key={outfit.title}>
                  <div className="outfit-visual">
                    <div className="match-label"><span>✦</span>{outfit.score}% 匹配</div>
                    <div className="look-canvas">
                      {outfit.colors.map((color, colorIndex) => <span key={`${color}-${colorIndex}`} className={`look-piece look-piece-${colorIndex + 1}`} style={{ background: color }} />)}
                    </div>
                    <button className={`save-float ${saved.includes(originalIndex) ? "active" : ""}`} onClick={() => setSaved((current) => current.includes(originalIndex) ? current.filter((item) => item !== originalIndex) : [...current, originalIndex])} aria-label="收藏搭配">{saved.includes(originalIndex) ? "♥" : "♡"}</button>
                  </div>
                  <div className="outfit-content">
                    <div className="outfit-title-row"><div><span className="outfit-tag">{outfit.tag}</span><h3>{outfit.title}</h3></div><button className="tiny-button" onClick={() => showToast("已为你准备单品替换选项")}>换一件</button></div>
                    <p className="outfit-items">{outfit.items}</p>
                    <p className="outfit-reason">{outfit.reason}</p>
                    <div className="feedback-row">
                      <button className={liked.includes(originalIndex) ? "active" : ""} onClick={() => setLiked((current) => current.includes(originalIndex) ? current.filter((item) => item !== originalIndex) : [...current, originalIndex])}>♡ 喜欢</button>
                      <button onClick={() => showToast("收到，下次会减少类似搭配")}>不适合我</button>
                      <button className={`wear-button ${worn.includes(originalIndex) ? "active" : ""}`} onClick={() => { setWorn((current) => [...new Set([...current, originalIndex])]); showToast("已记录：今天穿这套"); }}>{worn.includes(originalIndex) ? "✓ 已穿" : "今天穿这套"}</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {tab === "wardrobe" && (
        <section className="screen wardrobe-screen">
          <div className="page-title-row"><div><p className="eyebrow">你的数字衣橱</p><h1>我的衣柜</h1><p>{availableCount} 件可用 · {garments.length - availableCount} 件在脏衣篓</p></div><button className="upload-button" onClick={() => setUploadOpen(true)}>＋ 添加衣服</button></div>
          <div className="wardrobe-summary">
            <div><span className="summary-icon">✦</span><div><strong>本周穿到 7 件</strong><small>比上周多激活 2 件旧衣服</small></div></div><span className="progress-ring">68%</span>
          </div>
          <div className="filter-row">
            {["全部", "上衣", "下装", "外套", "鞋子", "脏衣篓"].map((filter) => <button key={filter} className={wardrobeFilter === filter ? "active" : ""} onClick={() => setWardrobeFilter(filter)}>{filter}</button>)}
          </div>
          {filteredGarments.length ? (
            <div className="garment-grid">
              {filteredGarments.map((garment) => (
                <article className={`garment-card ${garment.dirty ? "dirty" : ""}`} key={garment.id}>
                  <GarmentArt garment={garment} />
                  {garment.dirty && <span className="dirty-badge">清洗中</span>}
                  <div className="garment-copy"><small>{garment.category} · {garment.colorName}</small><h3>{garment.name}</h3><p>{garment.meta}</p><button onClick={() => toggleDirty(garment.id)}>{garment.dirty ? "恢复可用" : "放入脏衣篓"}</button></div>
                </article>
              ))}
            </div>
          ) : <div className="empty-state"><span>♨</span><h3>脏衣篓是空的</h3><p>放进去的衣服 3 天内不会参与推荐。</p></div>}
        </section>
      )}

      {tab === "discover" && (
        <section className="screen discover-screen">
          <div className="page-title-row"><div><p className="eyebrow">发现新的可能</p><h1>风格灵感</h1><p>喜欢或跳过，易搭会慢慢读懂你。</p></div></div>
          <div className="mood-board">
            <article className="mood-card mood-large"><div className="editorial-look look-a"><span /><span /><span /></div><div><small>本周灵感 · 通勤</small><h2>清爽的低饱和叠穿</h2><p>蓝灰与奶油白，是阴雨天也不沉闷的组合。</p><button onClick={() => showToast("已收藏到我的偏爱穿搭")}>♡ 收下这个风格</button></div></article>
            <article className="mood-card"><div className="editorial-look look-b"><span /><span /></div><small>松弛日常</small><h3>针织衫与牛仔裤</h3></article>
            <article className="mood-card"><div className="editorial-look look-c"><span /><span /></div><small>轻通勤</small><h3>西装也可以不严肃</h3></article>
          </div>
          <div className="taste-card"><div><span>你的偏好正在成形</span><strong>简约通勤 82%</strong><strong>清爽休闲 71%</strong></div><button onClick={() => showToast("偏好设置将在下一阶段开放")}>查看偏好 →</button></div>
        </section>
      )}

      {tab === "profile" && (
        <section className="screen profile-screen">
          <div className="profile-hero"><div className="large-avatar">晚</div><div><h1>晚晚</h1><p>和易搭一起生活的第 12 天</p></div><button onClick={() => { setOnboarding(true); setOnboardingStep(0); }}>重新体验引导</button></div>
          <div className="stat-grid"><div><strong>{garments.length}</strong><span>衣柜单品</span></div><div><strong>{saved.length}</strong><span>收藏搭配</span></div><div><strong>{worn.length + 7}</strong><span>本月已穿</span></div></div>
          <section className="profile-section"><div className="section-heading"><div><p className="eyebrow">最近 30 天</p><h2>穿搭记录</h2></div><button className="clear-button">查看全部</button></div><div className="history-list"><div><span className="history-date">今天</span><div className="mini-palette"><i style={{ background: "#b8cbd4" }} /><i style={{ background: "#595b5c" }} /><i style={{ background: "#e7ddca" }} /></div><p>雨天也清爽</p><b>已穿 ✓</b></div><div><span className="history-date">周六</span><div className="mini-palette"><i style={{ background: "#d9c8ad" }} /><i style={{ background: "#66819b" }} /></div><p>舒服不费力</p><b>已收藏</b></div></div></section>
          <section className="settings-list"><button><span>♡</span><div><strong>我的偏爱穿搭</strong><small>收藏与喜欢过的搭配</small></div><b>›</b></button><button><span>♨</span><div><strong>脏衣篓设置</strong><small>默认 3 天后恢复可用</small></div><b>›</b></button><button><span>◌</span><div><strong>个人偏好</strong><small>{styles.join("、")}</small></div><b>›</b></button><button><span>⌁</span><div><strong>隐私与数据</strong><small>定位、照片与删除设置</small></div><b>›</b></button></section>
        </section>
      )}

      <nav className="bottom-nav" aria-label="主要导航">
        <button className={tab === "today" ? "active" : ""} onClick={() => navTo("today")}><span>⌂</span>今日</button>
        <button className={tab === "wardrobe" ? "active" : ""} onClick={() => navTo("wardrobe")}><span>▦</span>衣柜</button>
        <button className="center-action" onClick={() => setUploadOpen(true)} aria-label="上传衣服"><span>＋</span></button>
        <button className={tab === "discover" ? "active" : ""} onClick={() => navTo("discover")}><span>✦</span>发现</button>
        <button className={tab === "profile" ? "active" : ""} onClick={() => navTo("profile")}><span>○</span>我的</button>
      </nav>

      {uploadOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setUploadOpen(false)}>
          <section className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-handle" /><div className="modal-heading"><div><p className="eyebrow">放进你的数字衣柜</p><h2 id="upload-title">添加一件衣服</h2></div><button onClick={() => setUploadOpen(false)} aria-label="关闭">×</button></div>
            <label className={`upload-zone ${uploadPreview ? "has-image" : ""}`}>
              {uploadPreview ? <img src={uploadPreview} alt="待上传衣服预览" /> : <><span>＋</span><strong>拍照或从相册选择</strong><small>尽量平铺，保持光线自然</small></>}
              <input type="file" accept="image/*" onChange={handleUpload} />
            </label>
            <p className="recognition-note"><span>✦</span>原型演示：正式版会自动抠图并识别衣服信息，你只需确认。</p>
            <div className="form-row"><label>衣服类型<select value={newCategory} onChange={(event) => setNewCategory(event.target.value)}><option>上衣</option><option>下装</option><option>外套</option><option>连衣裙</option><option>鞋子</option></select></label><label>主要颜色<select value={newColor} onChange={(event) => setNewColor(event.target.value)}><option>米白</option><option>黑色</option><option>灰色</option><option>蓝色</option><option>棕色</option><option>其他</option></select></label></div>
            <button className="primary-button" onClick={saveGarment}>确认加入衣柜</button>
          </section>
        </div>
      )}
      {toast && <div className="toast" role="status">✓ {toast}</div>}
    </main>
  );
}
