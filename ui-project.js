/* ==========================================================================
   [모듈] 프로젝트/기록 목록 UI 모듈 (ui-project.js)
   [역할]
   - 프로젝트 목록, 현재 프로젝트 선택, 생성/이름 변경/삭제 UI를 담당합니다.
   - 기록 목록 렌더링, 정렬 모달, 프로젝트 이동 모달 등 기록 탭 화면 흐름을 관리합니다.
   [동작 원리 요약]
   - AppState 프로젝트/레이어 상태를 읽어 목록 DOM을 구성하고, 각 카드/항목 액션을 기존 동작에 연결합니다.
   - 프로젝트 단위 관리와 기록 목록 표시 책임을 한 파일에 묶어 탭 단위 응집도를 유지합니다.
   ========================================================================== */
import { SVG_ICONS } from './config.js?v=2.4.8';
import { AppState } from './state.js?v=2.4.8';
import { drawnItems } from './draw.js?v=2.4.8';
import { saveToStorage } from './data.js?v=2.4.8';
import { closeAllDropdowns, switchSidebarTab } from './ui-core.js?v=2.4.8';

export let moveTargetLayerIds = [];

/**
 * [함수] renderProjectSelector
 * [역할] 현재 데이터 상태를 화면 요소로 재구성해 렌더링한다.
 * [원리] 원본 데이터(AppState/레이어 컬렉션)를 정렬·필터링해 표시 순서를 정하고,
 *        DOM 노드 또는 HTML을 재구성해 현재 상태를 화면에 다시 그린다.
 */
export function renderProjectSelector() {
    const select = document.getElementById('project-select');
    if (!select) return;

    select.innerHTML = "";
    AppState.projects.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.text = p.name + ` (${p.features.features ? p.features.features.length : 0}개)`;
        if (p.id === parseInt(AppState.currentProjectId)) option.selected = true;
        select.appendChild(option);
    });

    const currentProject = AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId));
    const bannerName = document.getElementById('current-project-name');
    if (bannerName && currentProject) {
        bannerName.textContent = currentProject.name;
    }

    const mapBadge = document.getElementById('map-active-project-badge');
    if (mapBadge && currentProject) {
        mapBadge.textContent = currentProject.name;
        mapBadge.style.display = 'block';
    }

    renderProjectList();
}

/**
 * [함수] createNewProject
 * [역할] 새 데이터를 만들고 목록/상태에 반영한다.
 * [원리] 이름/ID/생성시각 같은 기본값 규칙을 적용해 새 객체를 만들고,
 *        목록·선택 상태를 갱신해 방금 생성한 항목이 즉시 UI에 반영되게 한다.
 */
export function createNewProject(initialName) {
    let defaultName = initialName;
    if (!defaultName) {
        let cnt = 1;
        while (AppState.projects.some(p => p.name === `새 프로젝트 ${cnt}`)) {
            cnt++;
        }
        defaultName = `새 프로젝트 ${cnt}`;
    } else if (AppState.projects.some(p => p.name === defaultName)) {
        let cnt = 1;
        while (AppState.projects.some(p => p.name === `${defaultName} (${cnt})`)) {
            cnt++;
        }
        defaultName = `${defaultName} (${cnt})`;
    }
    const name = prompt("새 프로젝트 이름을 입력하세요:", defaultName);
    if (!name) return;
    if (name === "기본 프로젝트") {
        alert("'기본 프로젝트' 이름은 사용할 수 없습니다.");
        return;
    }
    const newProject = {
        id: Date.now(),
        name: name,
        features: { type: "FeatureCollection", features: [] },
        createdAt: new Date().toISOString()
    };
    AppState.projects.push(newProject);
    window.switchProject(newProject.id);
}

/**
 * [함수] editProjectName
 * [역할] 기존 데이터 편집 흐름을 시작하거나 변경값을 반영한다.
 * [원리] 대상 엔티티를 조회해 기존 값을 입력 UI에 채운 뒤,
 *        사용자 확정값을 속성에 반영하고 저장/리렌더 흐름으로 후처리한다.
 */
export function editProjectName() {
    const p = AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId));
    if (!p) return;
    if (p.name === "기본 프로젝트") {
        alert("기본 프로젝트의 이름은 변경할 수 없습니다.");
        return;
    }
    const newName = prompt("프로젝트 이름 수정:", p.name);
    if (!newName || newName === p.name) return;
    if (newName === "기본 프로젝트") {
        alert("'기본 프로젝트' 이름은 사용할 수 없습니다.");
        return;
    }
    p.name = newName;
    saveToStorage();
    renderProjectSelector();
}

/**
 * [함수] deleteCurrentProject
 * [역할] 대상을 삭제하고 후속 UI/저장 상태를 정리한다.
 * [원리] 삭제 대상 존재와 사용자 확인을 먼저 검증한 뒤,
 *        컬렉션에서 제거하고 저장·리스트 갱신·선택 상태 정리를 순서대로 수행한다.
 */
export function deleteCurrentProject() {
    const projectToDelete = AppState.projects.find(p => p.id === parseInt(AppState.currentProjectId));
    if (!projectToDelete) return;
    if (projectToDelete.name === "기본 프로젝트") {
        alert("기본 프로젝트는 삭제할 수 없습니다.");
        return;
    }
    if (AppState.projects.length <= 1) { alert("최소 하나 이상의 프로젝트가 필요합니다."); return; }
    if (!confirm(`'${projectToDelete.name}' 프로젝트와 모든 기록이 삭제됩니다. 계속하시겠습니까?`)) return;
    AppState.projects = AppState.projects.filter(p => p.id !== parseInt(AppState.currentProjectId));
    window.switchProject(AppState.projects[0].id);
}

/**
 * [함수] createProjectSectionHeader
 * [역할] 프로젝트 목록 섹션 헤더 DOM을 생성한다.
 * [원리] 제목과 정렬 버튼이 포함된 고정 구조 헤더를 구성해 반환한다.
 */
function createProjectSectionHeader() {
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding:0 5px;';
    header.innerHTML = `
        <span style="font-size:12px; font-weight:bold; color:#777;">생성된 프로젝트</span>
        <div class="dropdown-container" style="flex-shrink:0;">
            <button onclick="openProjectSortModal()" class="btn-more" title="정렬"
                style="background:none; border:none; padding:3px; cursor:pointer; color:#9ca3af; border-radius:6px; display:flex; align-items:center; justify-content:center;">
                <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" /></svg>
            </button>
        </div>
    `;
    return header;
}

/**
 * [함수] createProjectDropdownMenu
 * [역할] 프로젝트 카드 더보기 메뉴 항목을 구성한다.
 * [원리] 프로젝트 상태에 따라 저장/이름 변경/삭제 액션을 조건부로 생성해 메뉴에 붙인다.
 */
function createProjectDropdownMenu(p, dropdownMenu) {
    const saveItem = document.createElement('div');
    saveItem.className = 'dropdown-item';
    saveItem.innerHTML = `<svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" /></svg> 프로젝트 저장`;
    saveItem.onclick = (e) => {
        e.stopPropagation();
        dropdownMenu.classList.remove('visible');
        window.switchProject(p.id);
        if (window.exportCurrentProject) {
            window.exportCurrentProject();
        }
    };
    dropdownMenu.appendChild(saveItem);

    if (p.name !== "기본 프로젝트") {
        const editItem = document.createElement('div');
        editItem.className = 'dropdown-item';
        editItem.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg> 이름 변경`;
        editItem.onclick = (e) => {
            e.stopPropagation();
            dropdownMenu.classList.remove('visible');
            window.switchProject(p.id);
            editProjectName();
        };
        dropdownMenu.appendChild(editItem);

        const deleteItem = document.createElement('div');
        deleteItem.className = 'dropdown-item danger';
        deleteItem.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg> 프로젝트 삭제`;
        deleteItem.onclick = (e) => {
            e.stopPropagation();
            dropdownMenu.classList.remove('visible');
            window.switchProject(p.id);
            deleteCurrentProject();
        };
        dropdownMenu.appendChild(deleteItem);
    }
}

/**
 * [함수] createProjectCard
 * [역할] 프로젝트 목록 한 줄 카드 DOM을 생성한다.
 * [원리] 현재 프로젝트 여부와 생성일 정보를 반영해 카드 UI와 드롭다운 액션을 함께 구성한다.
 */
function createProjectCard(p, index, defaultProject) {
    const featureCount = p.features && p.features.features ? p.features.features.length : 0;
    const isActive = (p.id === parseInt(AppState.currentProjectId));
    const isDefault = (p.name === "기본 프로젝트" && index === 0);

    const card = document.createElement('div');
    card.style.cssText = [
        'display:flex', 'align-items:center', 'gap:10px',
        'padding:12px 10px', `margin-bottom:${isDefault ? '20px' : '6px'}`,
        'border-radius:10px', 'cursor:pointer',
        'border:1.5px solid ' + (isActive ? '#3B82F6' : '#e5e7eb'),
        'background:' + (isActive ? '#EFF6FF' : '#fff'),
        'transition:all 0.15s ease',
    ].join(';');

    const iconEl = document.createElement('div');
    iconEl.style.cssText = 'width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:' + (isActive ? '#3B82F6' : '#f3f4f6');
    iconEl.innerHTML = `<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:${isActive ? '#fff' : '#9ca3af'}"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/></svg>`;

    const textEl = document.createElement('div');
    textEl.style.cssText = 'flex:1; min-width:0;';

    let dateStr = "";
    if (p.createdAt) {
        const d = new Date(p.createdAt);
        const yy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        dateStr = `<div style="font-size:11px; color:#9ca3af; margin-top:2px;">${yy}.${mm}.${dd} ${hh}:${mins}:${ss} 생성</div>`;
    }

    textEl.innerHTML = `
        <div style="font-size:14px; font-weight:${isActive ? '700' : '500'}; color:${isActive ? '#1D4ED8' : '#374151'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
        <div style="font-size:12px; color:#9ca3af; margin-top:2px;">기록 ${featureCount}개</div>
        ${dateStr}
    `;

    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'dropdown-container';
    dropdownContainer.style.cssText = 'flex-shrink:0;';
    dropdownContainer.onclick = (e) => e.stopPropagation();

    const moreBtn = document.createElement('button');
    moreBtn.className = 'btn-more';
    moreBtn.title = '더보기';
    moreBtn.style.cssText = 'background:none; border:none; padding:5px; cursor:pointer; color:#9ca3af; border-radius:6px;';
    moreBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:currentColor;"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>`;

    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'dropdown-menu';

    moreBtn.onclick = (e) => {
        e.stopPropagation();
        closeAllDropdowns();
        dropdownMenu.classList.toggle('visible');
    };

    createProjectDropdownMenu(p, dropdownMenu);

    dropdownContainer.appendChild(moreBtn);
    dropdownContainer.appendChild(dropdownMenu);

    card.appendChild(iconEl);
    card.appendChild(textEl);
    card.appendChild(dropdownContainer);

    card.onclick = () => {
        window.switchProject(p.id);
        if (isActive) {
            switchSidebarTab('record');
        }
    };

    return card;
}

/**
 * [함수] renderProjectList
 * [역할] 현재 데이터 상태를 화면 요소로 재구성해 렌더링한다.
 * [원리] 기본 프로젝트와 일반 프로젝트를 분리한 뒤 정렬 옵션을 적용하고,
 *        카드·드롭다운 액션 DOM을 동적으로 구성해 프로젝트 전환/관리 동선을 연결한다.
 */
export function renderProjectList() {
    const container = document.getElementById('project-list-area');
    if (!container) return;

    container.innerHTML = '';

    if (AppState.projects.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#999; font-size:13px;">프로젝트가 없습니다.</div>';
        return;
    }

    let defaultProject = null;
    let otherProjects = [];
    AppState.projects.forEach(p => {
        if (p.name === "기본 프로젝트" && !defaultProject) {
            defaultProject = p;
        } else {
            otherProjects.push(p);
        }
    });

    otherProjects.sort((a, b) => {
        let valA, valB;
        if (AppState.projectSortBy === 'name') {
            valA = (a.name || "").toLowerCase();
            valB = (b.name || "").toLowerCase();
        } else {
            valA = new Date(a.createdAt || 0).getTime();
            valB = new Date(b.createdAt || 0).getTime();
        }
        let diff = 0;
        if (valA < valB) diff = -1;
        if (valA > valB) diff = 1;
        return AppState.projectSortOrder === 'asc' ? diff : -diff;
    });

    const displayProjects = [];
    if (defaultProject) displayProjects.push(defaultProject);
    displayProjects.push(...otherProjects);

    displayProjects.forEach((p, index) => {
        if ((defaultProject && index === 1) || (!defaultProject && index === 0)) {
            container.appendChild(createProjectSectionHeader());
        }
        container.appendChild(createProjectCard(p, index, defaultProject));
    });

    if (defaultProject && otherProjects.length === 0) {
        container.appendChild(createProjectSectionHeader());
    }
}

/**
 * [함수] createProjectMoveButton
 * [역할] 프로젝트 이동 대상 버튼 DOM을 생성한다.
 * [원리] 대상 프로젝트 이름/기록 수를 표시하고 클릭 시 이동 실행 함수를 연결한다.
 */
function createProjectMoveButton(project) {
    const btn = document.createElement('button');
    btn.style.cssText = "padding:14px; background:white; border:1px solid #ddd; border-radius:12px; text-align:left; cursor:pointer; font-size:15px; color:#333;";
    btn.innerHTML = `<b>${project.name}</b> <span style='color:#888; font-size:13px;'>(${project.features.features ? project.features.features.length : 0}개)</span>`;
    btn.onclick = () => executeMoveProject(project.id);
    return btn;
}

/**
 * [함수] openMoveProjectModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 대상 DOM/레이어 존재 여부를 확인한 뒤 display 값을 열고,
 *        requestAnimationFrame 또는 setTimeout으로 visible 클래스를 붙여 전환 애니메이션을 시작한다.
 */
export function openMoveProjectModal(layerId) {
    if (layerId) {
        moveTargetLayerIds = [layerId];
    } else {
        moveTargetLayerIds = [];
        const layers = drawnItems.getLayers();
        layers.forEach(layer => {
            if (!layer.feature.properties.isHidden) {
                moveTargetLayerIds.push(layer.feature.properties.id);
            }
        });
        if (moveTargetLayerIds.length === 0) {
            alert("이동할 기록이 없습니다. (체크된 항목이 이동됩니다)");
            return;
        }
    }

    const list = document.getElementById('project-move-list');
    list.innerHTML = "";

    let otherProjectsCount = 0;
    AppState.projects.forEach(p => {
        if (p.id === parseInt(AppState.currentProjectId)) return;
        otherProjectsCount++;
        list.appendChild(createProjectMoveButton(p));
    });

    if (otherProjectsCount === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.style.cssText = 'text-align:center; padding:10px; color:#999; font-size:13px;';
        emptyMsg.innerText = "이동할 다른 프로젝트가 없습니다.";
        list.appendChild(emptyMsg);
    }

    const overlay = document.getElementById('project-move-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => { overlay.classList.add('visible'); }, 10);
}

/**
 * [함수] createNewProjectAndMove
 * [역할] 새 데이터를 만들고 목록/상태에 반영한다.
 * [원리] 이름/ID/생성시각 같은 기본값 규칙을 적용해 새 객체를 만들고,
 *        목록·선택 상태를 갱신해 방금 생성한 항목이 즉시 UI에 반영되게 한다.
 */
export function createNewProjectAndMove() {
    let defaultName = "새 프로젝트 " + (AppState.projects.length + 1);
    if (AppState.projects.some(p => p.name === defaultName)) {
        let cnt = 1;
        while (AppState.projects.some(p => p.name === `${defaultName} (${cnt})`)) cnt++;
        defaultName = `${defaultName} (${cnt})`;
    }
    const name = prompt("새 프로젝트 이름을 입력하세요:", defaultName);
    if (!name) return;

    const newProject = {
        id: Date.now(),
        name: name,
        features: { type: "FeatureCollection", features: [] },
        createdAt: new Date().toISOString()
    };
    AppState.projects.push(newProject);
    renderProjectSelector();
    executeMoveProject(newProject.id);
}

/**
 * [함수] executeMoveProject
 * [역할] 사용자 선택에 따라 실제 동작(이동/저장/연결)을 수행한다.
 * [원리] 사용자 선택값을 실제 실행 경로(URL/이동/저장 작업)로 변환하고,
 *        완료 후 모달 닫기·화면 갱신 등 후속 UI 정리까지 한 흐름으로 처리한다.
 */
function executeMoveProject(targetProjectId) {
    if (moveTargetLayerIds.length === 0) return;
    const targetProject = AppState.projects.find(p => p.id === parseInt(targetProjectId));
    if (!targetProject) return;
    if (!targetProject.features || !targetProject.features.features) {
        targetProject.features = { type: "FeatureCollection", features: [] };
    }
    let movedCount = 0;
    moveTargetLayerIds.forEach(id => {
        const layer = drawnItems.getLayers().find(l => l.feature.properties.id === id);
        if (layer) {
            targetProject.features.features.push(layer.toGeoJSON());
            drawnItems.removeLayer(layer);
            movedCount++;
        }
    });
    if (movedCount > 0) {
        saveToStorage();
        renderSurveyList();
        alert(`${movedCount}개의 기록이 '${targetProject.name}'으로 이동되었습니다.`);
        closeMoveProjectModal();
        window.switchProject(targetProject.id);
    }
}

/**
 * [함수] openMoveSelectionModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 다중 선택 이동 흐름에서 공통 프로젝트 이동 모달을 재사용해 연다.
 */
export function openMoveSelectionModal() {
    openMoveProjectModal(null);
}

/**
 * [함수] closeMoveProjectModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 표시 중인 오버레이를 닫고 이동 대상 ID 목록을 초기화해 다음 흐름과 충돌을 막는다.
 */
export function closeMoveProjectModal() {
    const overlay = document.getElementById('project-move-modal-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
    moveTargetLayerIds = [];
}

/**
 * [함수] createSurveyStyleButton
 * [역할] 기록 목록의 스타일 버튼 HTML을 생성한다.
 * [원리] 점/선/면 타입과 사용자 스타일 속성에 따라 프리뷰 모양을 조합해 반환한다.
 */
function createSurveyStyleButton(layer, props, displayColor, customEmoji) {
    let bgStyle = "";
    let btnContent = "";
    let buttonStyle = "width:28px; height:28px; border-radius:50%; flex-shrink:0; cursor:pointer; box-sizing:border-box;";

    if (layer instanceof L.Marker) {
        buttonStyle = "width:28px; height:28px; border:none; background:transparent; display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer; padding:0;";
        if (customEmoji) {
            btnContent = `<span style="font-size: 22px; line-height: 1;">${customEmoji}</span>`;
        } else {
            const fallbackColor = displayColor === 'transparent' ? '#ccc' : displayColor;
            btnContent = `<svg viewBox="0 0 24 24" width="24" height="24" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" 
                          fill="${fallbackColor}" stroke="white" stroke-width="1"/>
                </svg>`;
        }
    } else if (layer instanceof L.Polygon) {
        const customFill = props.customFill === true || (props.customFill === undefined && AppState.isPolygonFill);
        const isNone = props.customDashArray === 'none';
        const isDashed = props.customDashArray && !isNone;
        const bStyle = isNone ? 'solid' : (isDashed ? 'dashed' : 'solid');
        const bColor = isNone ? '#eee' : displayColor;
        buttonStyle = "width:28px; height:28px; border:1px solid #ddd; border-radius:4px; background:transparent; display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer; box-sizing:border-box; padding:1px;";
        const fillStyle = customFill ? `background:${displayColor}; opacity:0.4;` : "background:transparent;";
        btnContent = `
                <div style="width:100%; height:100%; border-radius:2px; box-sizing:border-box; border: 2px ${bStyle} ${bColor}; overflow:hidden;">
                    <div style="width:100%; height:100%; ${fillStyle}"></div>
                </div>`;
    } else {
        const isNone = props.customDashArray === 'none';
        const isDashed = props.customDashArray && !isNone;
        const bStyle = isNone ? 'solid' : (isDashed ? 'dashed' : 'solid');
        const bColor = isNone ? '#eee' : displayColor;
        buttonStyle = "width:28px; height:28px; border:1px solid #ddd; border-radius:4px; background:transparent; display:flex; align-items:center; justify-content:center; flex-shrink:0; cursor:pointer; box-sizing:border-box; padding:1px;";
        btnContent = `<div style="width:100%; height:100%; overflow:hidden; border-radius:2px; display:flex; align-items:center; justify-content:center;"><div style="width:38px; height:0; border-top: 3px ${bStyle} ${bColor}; transform: rotate(-45deg);"></div></div>`;
    }

    return `<button class="style-setting-btn" style="${buttonStyle} ${bgStyle}" title="스타일 설정" onclick="openStyleModal(${props.id})">${btnContent}</button>`;
}

/**
 * [함수] createSurveyItem
 * [역할] 기록 목록 한 줄 항목 DOM을 생성한다.
 * [원리] 레이어 타입, 가시성, 날짜, 스타일 버튼을 조합해 기존 목록 구조를 그대로 반환한다.
 */
function createSurveyItem(layer) {
    const props = layer.feature.properties || {};
    const isHidden = props.isHidden === true;
    const typeIcon = (layer instanceof L.Marker) ? SVG_ICONS.marker : (layer instanceof L.Polygon ? SVG_ICONS.polygon : (props.isTrack ? SVG_ICONS.track : SVG_ICONS.ruler));
    let dateStr = "";
    if (props.id) {
        const d = new Date(props.id);
        if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
            dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        }
    }
    const div = document.createElement('div');
    div.className = 'survey-item';
    const displayColor = props.customColor || (layer instanceof L.Marker ? '#FF0000' : '#3388ff');
    const customEmoji = props.customEmoji || null;
    const styleBtnHTML = createSurveyStyleButton(layer, props, displayColor, customEmoji);

    div.innerHTML = `
    <div class="survey-check-area">
        <input type="checkbox" class="survey-checkbox" ${!isHidden ? "checked" : ""} onchange="toggleLayerVisibility(${props.id})">
    </div>
    <span style="flex-shrink:0; display:flex; align-items:center; color:#999;">${typeIcon}</span>
    <div class="survey-info" onclick="zoomToLayer(${props.id})">
        <div class="survey-name">${props.memo}</div>
        ${dateStr ? `<div style="font-size:11px; color:#aaa; margin-top:1px;">${dateStr}</div>` : ''}
    </div>
    <div class="survey-actions">
        ${styleBtnHTML}
        <button class="btn-more" onclick="openContextMenu(event, ${props.id})">${SVG_ICONS.more}</button>
    </div>`;
    return div;
}

/**
 * [함수] renderSurveyList
 * [역할] 현재 데이터 상태를 화면 요소로 재구성해 렌더링한다.
 * [원리] 레이어 목록을 정렬 기준에 맞게 재배열하고 각 항목 DOM을 생성해 순서대로 그린다.
 */
export function renderSurveyList() {
    const listContainer = document.getElementById('survey-list-area');
    if (!listContainer) return;
    listContainer.innerHTML = "";
    const layers = drawnItems.getLayers();
    const chkSelectAll = document.getElementById('chk-select-all');
    const allVisible = layers.length > 0 && layers.every(l => !l.feature.properties.isHidden);
    if (chkSelectAll) chkSelectAll.checked = (layers.length > 0 && allVisible);

    if (layers.length === 0) {
        listContainer.innerHTML = '<div style="padding:15px; text-align:center; color:#999; font-size:12px;">기록 없음</div>';
        return;
    }

    const sortedLayers = [...layers].sort((a, b) => {
        const pa = a.feature.properties;
        const pb = b.feature.properties;
        let cmp = 0;
        if (AppState.sortBy === 'name') {
            const na = (pa.memo || '').toLowerCase();
            const nb = (pb.memo || '').toLowerCase();
            cmp = na.localeCompare(nb, 'ko');
        } else {
            cmp = (pa.id || 0) - (pb.id || 0);
        }
        return AppState.sortOrder === 'asc' ? cmp : -cmp;
    });

    sortedLayers.forEach(layer => {
        listContainer.appendChild(createSurveyItem(layer));
    });
}

/**
 * [함수] openSortModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 현재 기록 정렬 상태를 라디오 버튼에 반영한 뒤 모달 오버레이를 노출한다.
 */
export function openSortModal() {
    const overlay = document.getElementById('sort-modal-overlay');
    if (!overlay) return;

    document.querySelectorAll('input[name="sort-by"]').forEach(r => {
        r.checked = (r.value === AppState.sortBy);
    });
    document.querySelectorAll('input[name="sort-order"]').forEach(r => {
        r.checked = (r.value === AppState.sortOrder);
    });

    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('visible'), 10);
}

/**
 * [함수] closeSortModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 가시 클래스를 제거한 뒤 지연 후 display를 숨겨 모달 닫힘 애니메이션을 유지한다.
 */
export function closeSortModal() {
    const overlay = document.getElementById('sort-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/**
 * [함수] applySortSetting
 * [역할] 임시 설정값을 실제 상태와 화면에 확정 반영한다.
 * [원리] 선택된 라디오 값을 전역 정렬 상태와 로컬 저장소에 반영한 뒤 목록을 다시 그린다.
 */
export function applySortSetting() {
    const byEl = document.querySelector('input[name="sort-by"]:checked');
    const orderEl = document.querySelector('input[name="sort-order"]:checked');
    if (byEl) {
        AppState.sortBy = byEl.value;
        localStorage.setItem('setting_sort_by', byEl.value);
    }
    if (orderEl) {
        AppState.sortOrder = orderEl.value;
        localStorage.setItem('setting_sort_order', orderEl.value);
    }
    closeSortModal();
    renderSurveyList();
}

/**
 * [함수] openProjectSortModal
 * [역할] 관련 UI를 열고 상호작용 가능한 상태로 만든다.
 * [원리] 현재 프로젝트 정렬 상태를 라디오 버튼에 반영한 뒤 모달 오버레이를 노출한다.
 */
export function openProjectSortModal() {
    const overlay = document.getElementById('project-sort-modal-overlay');
    if (!overlay) return;

    document.querySelectorAll('input[name="project-sort-by"]').forEach(r => {
        r.checked = (r.value === AppState.projectSortBy);
    });
    document.querySelectorAll('input[name="project-sort-order"]').forEach(r => {
        r.checked = (r.value === AppState.projectSortOrder);
    });

    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('visible'), 10);
}

/**
 * [함수] closeProjectSortModal
 * [역할] 관련 UI를 닫고 임시 상태를 정리한다.
 * [원리] 가시 클래스를 제거한 뒤 지연 후 display를 숨겨 모달 닫힘 애니메이션을 유지한다.
 */
export function closeProjectSortModal() {
    const overlay = document.getElementById('project-sort-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    setTimeout(() => { overlay.style.display = 'none'; }, 300);
}

/**
 * [함수] applyProjectSortSetting
 * [역할] 임시 설정값을 실제 상태와 화면에 확정 반영한다.
 * [원리] 선택된 라디오 값을 프로젝트 정렬 상태와 로컬 저장소에 반영한 뒤 목록을 다시 그린다.
 */
export function applyProjectSortSetting() {
    const byEl = document.querySelector('input[name="project-sort-by"]:checked');
    const orderEl = document.querySelector('input[name="project-sort-order"]:checked');
    if (byEl) {
        AppState.projectSortBy = byEl.value;
        localStorage.setItem('setting_project_sort_by', byEl.value);
    }
    if (orderEl) {
        AppState.projectSortOrder = orderEl.value;
        localStorage.setItem('setting_project_sort_order', orderEl.value);
    }
    closeProjectSortModal();
    renderProjectList();
}
