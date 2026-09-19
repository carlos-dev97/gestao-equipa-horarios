"use strict";

/* =========================================================
   CONFIGURAÇÃO
   ========================================================= */

const STORAGE_KEY = "gestao_equipa_horarios_final_v5";

const DAY_NAMES = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado"
];

const SHORT_DAY_NAMES = [
    "SEG",
    "TER",
    "QUA",
    "QUI",
    "SEX",
    "SÁB",
    "DOM"
];

const MONTH_NAMES = [
    "JANEIRO",
    "FEVEREIRO",
    "MARÇO",
    "ABRIL",
    "MAIO",
    "JUNHO",
    "JULHO",
    "AGOSTO",
    "SETEMBRO",
    "OUTUBRO",
    "NOVEMBRO",
    "DEZEMBRO"
];

let appData = {
    employees: [],
    schedules: {}
};

let currentMonday = getMonday(new Date());
let editingEmployeeId = null;
let editingScheduleKey = null;
let toastTimeout = null;

const $ = (id) => document.getElementById(id);


/* =========================================================
   ARRANQUE
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    loadData();
    setupEvents();
    renderAll();
    registerServiceWorker();
});


/* =========================================================
   EVENTOS
   ========================================================= */

function setupEvents() {

    bindClick("scheduleNavButton", () => showSection("schedule"));

    bindClick("employeesNavButton", () => showSection("employees"));

    bindClick("historyNavButton", () => showSection("history"));

    bindClick("previousWeekButton", () => {
        currentMonday = addDays(currentMonday, -7);
        renderWeek();
    });

    bindClick("nextWeekButton", () => {
        currentMonday = addDays(currentMonday, 7);
        renderWeek();
    });

    bindClick("todayButton", () => {
        currentMonday = getMonday(new Date());
        showSection("schedule");
        renderWeek();
    });

    bindClick("printButton", printSchedule);

    bindClick("addEmployeeButton", () => openEmployeeModal());

    bindClick("emptyEmployeeButton", () => openEmployeeModal());

    bindClick(
        "addEmployeeFromScheduleButton",
        () => openEmployeeModal()
    );

    bindClick(
        "emptyAddEmployeeButton",
        () => openEmployeeModal()
    );

    bindClick("addScheduleButton", () => {

        if (isCurrentWeekLocked()) {
            showLockedWeekToast();
            return;
        }

        openScheduleModal();
    });

    bindClick("cancelEmployeeButton", closeEmployeeModal);

    bindClick("cancelScheduleButton", closeScheduleModal);

    bindClick("deleteEmployeeButton", deleteCurrentEmployee);

    bindClick("deleteScheduleButton", deleteCurrentSchedule);

    bindClick("applyVacationButton", applyVacationPeriod);

    bindClick(
        "currentWeekVacationButton",
        () => setVacationShortcut("current")
    );

    bindClick(
        "nextWeekVacationButton",
        () => setVacationShortcut("next")
    );

    const employeeForm = $("employeeForm");

    if (employeeForm) {
        employeeForm.addEventListener(
            "submit",
            saveEmployeeFromForm
        );
    }

    const scheduleForm = $("scheduleForm");

    if (scheduleForm) {
        scheduleForm.addEventListener(
            "submit",
            saveScheduleFromForm
        );
    }

    const status = $("scheduleStatus");

    if (status) {
        status.addEventListener(
            "change",
            updateScheduleFields
        );
    }

    const secondToggle = $("toggleSecondPeriod");

    if (secondToggle) {
        secondToggle.addEventListener(
            "change",
            updateSecondPeriodVisibility
        );
    }

    const employeeFilter = $("employeeFilter");

    if (employeeFilter) {
        employeeFilter.addEventListener(
            "change",
            renderWeek
        );
    }

    const historyMonthFilter = $("historyMonthFilter");

    if (historyMonthFilter) {
        historyMonthFilter.addEventListener(
            "change",
            renderHistory
        );
    }

    document
        .querySelectorAll(".modal-overlay, .modal-close")
        .forEach((element) => {

            element.addEventListener("click", () => {

                const modal = element.closest(".modal");

                if (modal) {
                    closeModal(modal);
                }
            });
        });

    document.addEventListener("keydown", (event) => {

        if (event.key === "Escape") {

            document
                .querySelectorAll(".modal.open")
                .forEach(closeModal);
        }
    });
}


function bindClick(id, callback) {

    const element = $(id);

    if (!element) return;

    element.addEventListener("click", callback);
}


/* =========================================================
   STORAGE
   ========================================================= */

function loadData() {

    try {

        const possibleKeys = [
            STORAGE_KEY,
            "gestao_equipa_horarios_final_v4",
            "gestao_equipa_horarios_final_v3",
            "gestao_equipa_horarios_final_v2",
            "gestao_equipa_horarios_final_v1"
        ];

        let saved = null;

        for (const key of possibleKeys) {

            const candidate = localStorage.getItem(key);

            if (candidate) {
                saved = candidate;
                break;
            }
        }

        if (!saved) return;

        const parsed = JSON.parse(saved);

        if (!parsed || typeof parsed !== "object") {
            return;
        }

        appData = {
            employees: Array.isArray(parsed.employees)
                ? parsed.employees
                : [],

            schedules:
                parsed.schedules &&
                typeof parsed.schedules === "object"
                    ? parsed.schedules
                    : {}
        };

        appData.employees = appData.employees.map(
            (employee) => ({
                ...employee,

                id: normalizeId(
                    employee.id ||
                    employee.employeeId ||
                    generateId()
                ),

                name:
                    employee.name ||
                    employee.nome ||
                    "",

                type:
                    employee.type ||
                    employee.function ||
                    "",

                weeklyHours:
                    Number(
                        employee.weeklyHours ??
                        employee.hours ??
                        40
                    ),

                birthDate:
                    employee.birthDate ||
                    employee.birth ||
                    ""
            })
        );

        normalizeSchedules();

        saveData();

    } catch (error) {

        console.error(
            "Erro ao carregar dados:",
            error
        );

        appData = {
            employees: [],
            schedules: {}
        };
    }
}


function saveData() {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(appData)
    );
}


/* =========================================================
   NORMALIZAÇÃO
   ========================================================= */

function normalizeSchedules() {

    const normalized = {};

    Object.entries(appData.schedules).forEach(
        ([key, schedule]) => {

            if (
                !schedule ||
                typeof schedule !== "object"
            ) {
                return;
            }

            const employeeId = normalizeId(
                schedule.employeeId ||
                schedule.employee ||
                key.split("__")[0]
            );

            const date =
                schedule.date ||
                key.split("__")[1] ||
                "";

            if (!employeeId || !date) {
                return;
            }

            const newKey = makeScheduleKey(
                employeeId,
                date
            );

            normalized[newKey] = {
                ...schedule,
                employeeId,
                date
            };
        }
    );

    appData.schedules = normalized;
}


/* =========================================================
   RENDER GERAL
   ========================================================= */

function renderAll() {

    renderEmployees();
    renderEmployeeFilter();
    renderWeek();
    renderHistory();
}


/* =========================================================
   SEÇÕES
   ========================================================= */

function showSection(section) {

    const scheduleSection = $("scheduleSection");
    const employeesSection = $("employeesSection");
    const historySection = $("historySection");

    const scheduleButton = $("scheduleNavButton");
    const employeesButton = $("employeesNavButton");
    const historyButton = $("historyNavButton");

    scheduleSection?.classList.remove("active");
    employeesSection?.classList.remove("active");
    historySection?.classList.remove("active");

    scheduleButton?.classList.remove("active");
    employeesButton?.classList.remove("active");
    historyButton?.classList.remove("active");

    if (section === "employees") {

        employeesSection?.classList.add("active");
        employeesButton?.classList.add("active");

        return;
    }

    if (section === "history") {

        historySection?.classList.add("active");
        historyButton?.classList.add("active");

        renderHistory();

        return;
    }

    scheduleSection?.classList.add("active");
    scheduleButton?.classList.add("active");

    renderWeek();
}


/* =========================================================
   FUNCIONÁRIOS
   ========================================================= */

function renderEmployees() {

    const grid = $("employeesGrid");
    const empty = $("emptyEmployeeState");

    if (!grid) return;

    grid.innerHTML = "";

    if (appData.employees.length === 0) {

        empty?.classList.add("visible");

        return;
    }

    empty?.classList.remove("visible");

    appData.employees.forEach((employee) => {

        const card = document.createElement("article");

        card.className = "employee-card";

        const birth = employee.birthDate
            ? formatBirthDate(employee.birthDate)
            : "Sem data de nascimento";

        card.innerHTML = `
            <div class="employee-card-top">
                <div class="employee-avatar-icon">
                    👤
                </div>

                <button
                    class="card-edit-button"
                    type="button"
                    data-edit-employee="${escapeHtml(employee.id)}"
                    aria-label="Editar ${escapeHtml(employee.name)}"
                >
                    ✎
                </button>
            </div>

            <div class="employee-card-body">
                <h3>
                    ${escapeHtml(employee.name)}
                </h3>

                <p>
                    ${escapeHtml(employee.type || "Sem função")}
                </p>

                <div class="employee-meta">
                    <span>
                        ⏱ ${formatHoursNumber(employee.weeklyHours)}h/semana
                    </span>

                    <span>
                        🎂 ${escapeHtml(birth)}
                    </span>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });

    grid
        .querySelectorAll("[data-edit-employee]")
        .forEach((button) => {

            button.addEventListener("click", () => {

                const employeeId =
                    button.getAttribute("data-edit-employee");

                openEmployeeModal(employeeId);
            });
        });
}


/* =========================================================
   FILTRO FUNCIONÁRIOS
   ========================================================= */

function renderEmployeeFilter() {

    const select = $("employeeFilter");

    if (!select) return;

    const currentValue = select.value || "all";

    select.innerHTML = "";

    const allOption = document.createElement("option");

    allOption.value = "all";
    allOption.textContent = "Todos os funcionários";

    select.appendChild(allOption);

    appData.employees.forEach((employee) => {

        const option = document.createElement("option");

        option.value = normalizeId(employee.id);
        option.textContent = employee.name;

        select.appendChild(option);
    });

    const exists =
        currentValue === "all" ||
        appData.employees.some(
            (employee) =>
                normalizeId(employee.id) ===
                normalizeId(currentValue)
        );

    select.value = exists ? currentValue : "all";
}


/* =========================================================
   MODAL FUNCIONÁRIO
   ========================================================= */

function openEmployeeModal(employeeId = null) {

    const modal = $("employeeModal");
    const form = $("employeeForm");

    if (!modal || !form) return;

    editingEmployeeId = employeeId
        ? normalizeId(employeeId)
        : null;

    form.reset();

    $("employeeId").value =
        editingEmployeeId || "";

    $("employeeHours").value = "40";

    const employee = editingEmployeeId
        ? getEmployeeById(editingEmployeeId)
        : null;

    const title = $("employeeModalTitle");
    const deleteButton = $("deleteEmployeeButton");

    if (employee) {

        if (title) {
            title.textContent = "Editar funcionário";
        }

        $("employeeName").value =
            employee.name || "";

        $("employeeType").value =
            employee.type || "";

        $("employeeHours").value =
            employee.weeklyHours ?? 40;

        $("employeeBirth").value =
            employee.birthDate || "";

        deleteButton?.classList.remove("hidden");

    } else {

        if (title) {
            title.textContent = "Novo funcionário";
        }

        deleteButton?.classList.add("hidden");
    }

    openModal(modal);
}


function saveEmployeeFromForm(event) {

    event.preventDefault();

    const name =
        $("employeeName")
            .value
            .trim();

    if (!name) {

        showToast(
            "Indica o nome do funcionário."
        );

        return;
    }

    const employeeId =
        normalizeId(
            $("employeeId").value
        ) || generateId();

    const employee = {
        id: employeeId,

        name,

        type:
            $("employeeType")
                .value
                .trim(),

        weeklyHours:
            Number(
                $("employeeHours").value
            ) || 0,

        birthDate:
            $("employeeBirth").value || ""
    };

    const existingIndex =
        appData.employees.findIndex(
            (item) =>
                normalizeId(item.id) ===
                employeeId
        );

    if (existingIndex >= 0) {

        appData.employees[existingIndex] =
            employee;

    } else {

        appData.employees.push(employee);
    }

    saveData();

    closeEmployeeModal();

    renderAll();

    showToast(
        existingIndex >= 0
            ? "Funcionário atualizado."
            : "Funcionário adicionado."
    );
}


function deleteCurrentEmployee() {

    if (!editingEmployeeId) return;

    const employee =
        getEmployeeById(editingEmployeeId);

    if (!employee) return;

    if (
        !confirm(
            `Eliminar ${employee.name}?\n\n` +
            `Os horários deste funcionário também serão eliminados.`
        )
    ) {
        return;
    }

    const employeeId =
        normalizeId(editingEmployeeId);

    appData.employees =
        appData.employees.filter(
            (item) =>
                normalizeId(item.id) !==
                employeeId
        );

    Object.keys(appData.schedules).forEach(
        (key) => {

            const schedule =
                appData.schedules[key];

            if (
                normalizeId(schedule.employeeId) ===
                employeeId
            ) {
                delete appData.schedules[key];
            }
        }
    );

    saveData();

    closeEmployeeModal();

    renderAll();

    showToast(
        "Funcionário eliminado."
    );
}


/* =========================================================
   SEMANA
   ========================================================= */

function renderWeek() {

    renderWeekHeader();
    renderScheduleTable();
    updateSummary();
    updateWeekLockUI();
}


function renderWeekHeader() {

    const weekInfo =
        getWeekInfo(currentMonday);

    const dates =
        getWeekDates(currentMonday);

    if ($("weekMonth")) {

        $("weekMonth").textContent =
            weekInfo.monthName;
    }

    /*
     * Já não utilizamos semanas numeradas.
     * Mantemos o elemento vazio caso ainda exista
     * no HTML/CSS para não causar problemas.
     */
    if ($("weekNumber")) {

        $("weekNumber").textContent = "";
    }

    if ($("weekRange")) {

        $("weekRange").textContent =
            formatWeekRange(dates);
    }

    dates.forEach((date, index) => {

        const header =
            $(`headerDay${index + 1}`);

        if (!header) return;

        header.innerHTML = `
            <span class="header-day-name">
                ${SHORT_DAY_NAMES[index]}
            </span>

            <span class="header-day-date">
                ${formatShortDate(date)}
            </span>
        `;
    });
}


/* =========================================================
   INFORMAÇÃO DA SEMANA
   ========================================================= */

/*
 * A semana é identificada pelo mês da segunda-feira.
 *
 * Exemplos:
 *
 * 31/08 — 06/09 → AGOSTO
 * 07/09 — 13/09 → SETEMBRO
 * 28/09 — 04/10 → SETEMBRO
 * 05/10 — 11/10 → OUTUBRO
 *
 * Desta forma não temos "Semana 1", "Semana 2", etc.
 */

function getWeekInfo(monday) {

    const mondayDate =
        new Date(monday);

    mondayDate.setHours(
        0,
        0,
        0,
        0
    );

    const year =
        mondayDate.getFullYear();

    const month =
        mondayDate.getMonth();

    return {
        year,
        month,
        monthName:
            MONTH_NAMES[month]
    };
}


/* =========================================================
   BLOQUEIO AUTOMÁTICO
   ========================================================= */

function isWeekLocked(monday) {

    const weekEnd =
        addDays(monday, 6);

    const today = new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );

    weekEnd.setHours(
        0,
        0,
        0,
        0
    );

    return (
        weekEnd.getTime() <
        today.getTime()
    );
}


function isCurrentWeekLocked() {

    return isWeekLocked(currentMonday);
}


function showLockedWeekToast() {

    showToast(
        "🔒 Semana encerrada — esta semana está no histórico e já não pode ser alterada."
    );
}


function updateWeekLockUI() {

    const locked =
        isCurrentWeekLocked();

    const banner =
        $("historyLockBanner");

    if (banner) {

        banner.classList.toggle(
            "hidden",
            !locked
        );
    }

    const addScheduleButton =
        $("addScheduleButton");

    if (addScheduleButton) {

        addScheduleButton.classList.toggle(
            "hidden",
            locked
        );
    }
}


/* =========================================================
   TABELA
   ========================================================= */

function renderScheduleTable() {

    const tbody =
        $("scheduleTableBody");

    const empty =
        $("emptyScheduleState");

    if (!tbody) return;

    tbody.innerHTML = "";

    if (appData.employees.length === 0) {

        empty?.classList.add("visible");

        return;
    }

    empty?.classList.remove("visible");

    const filter =
        $("employeeFilter")?.value ||
        "all";

    const employees =
        filter === "all"
            ? appData.employees
            : appData.employees.filter(
                (employee) =>
                    normalizeId(employee.id) ===
                    normalizeId(filter)
            );

    employees.forEach((employee) => {

        const row =
            document.createElement("tr");

        const employeeCell =
            document.createElement("td");

        employeeCell.className =
            "employee-cell";

        const employeeType =
            employee.type
                ? `
                    <small>
                        ${escapeHtml(employee.type)}
                    </small>
                `
                : "";

        employeeCell.innerHTML = `
            <div class="employee-table-name">
                <strong>
                    ${escapeHtml(employee.name)}
                </strong>

                ${employeeType}
            </div>
        `;

        row.appendChild(employeeCell);

        let weeklyMinutes = 0;

        const dates =
            getWeekDates(currentMonday);

        dates.forEach((date) => {

            const dateKey =
                formatDateKey(date);

            const schedule =
                getSchedule(
                    employee.id,
                    dateKey
                );

            weeklyMinutes +=
                calculateScheduleMinutes(schedule);

            const cell =
                createScheduleCell(
                    employee,
                    date,
                    schedule
                );

            row.appendChild(cell);
        });

        const totalCell =
            document.createElement("td");

        totalCell.className =
            "weekly-total-cell";

        totalCell.textContent =
            formatMinutes(weeklyMinutes);

        row.appendChild(totalCell);

        tbody.appendChild(row);
    });
}


/* =========================================================
   CÉLULA HORÁRIO
   ========================================================= */

function createScheduleCell(
    employee,
    date,
    schedule
) {

    const cell =
        document.createElement("td");

    cell.className =
        "schedule-cell";

    const dateKey =
        formatDateKey(date);

    const birthday =
        isBirthday(employee, date);

    if (schedule) {

        cell.classList.add(
            `status-${schedule.status || "work"}`
        );
    }

    const button =
        document.createElement("button");

    button.type = "button";

    button.className =
        "schedule-cell-button";

    if (!schedule) {

        button.classList.add("empty");

        button.innerHTML = `
            <span class="plus-sign">
                +
            </span>

            <span>
                Adicionar
            </span>
        `;

    } else {

        button.innerHTML =
            getScheduleCellContent(schedule);
    }

    if (birthday) {

        const birthdayElement =
            document.createElement("div");

        birthdayElement.className =
            "birthday-label";

        birthdayElement.textContent =
            "🎂 Aniversário";

        button.appendChild(
            birthdayElement
        );
    }

    button.addEventListener("click", () => {

        if (isCurrentWeekLocked()) {

            showLockedWeekToast();

            return;
        }

        openScheduleModal(
            employee.id,
            dateKey
        );
    });

    cell.appendChild(button);

    return cell;
}


function getScheduleCellContent(schedule) {

    const status =
        schedule?.status ||
        "work";

    if (status === "off") {

        return `
            <span class="status-text">
                Folga
            </span>
        `;
    }

    if (status === "vacation") {

        return `
            <span class="status-text">
                Férias
            </span>
        `;
    }

    if (status === "sick") {

        return `
            <span class="status-text">
                Baixa
            </span>
        `;
    }

    const parts = [];

    if (
        schedule.start1 &&
        schedule.end1
    ) {

        parts.push(
            `${escapeHtml(schedule.start1)} – ${escapeHtml(schedule.end1)}`
        );
    }

    if (
        schedule.start2 &&
        schedule.end2
    ) {

        parts.push(
            `${escapeHtml(schedule.start2)} – ${escapeHtml(schedule.end2)}`
        );
    }

    if (parts.length === 0) {

        return `
            <span class="status-text">
                Horário
            </span>
        `;
    }

    return `
        <span class="shift-time">
            ${parts.join("<br>")}
        </span>
    `;
}


/* =========================================================
   MODAL HORÁRIO
   ========================================================= */

function openScheduleModal(
    employeeId = null,
    dateKey = null
) {

    if (isCurrentWeekLocked()) {

        showLockedWeekToast();

        return;
    }

    if (appData.employees.length === 0) {

        showToast(
            "Adiciona primeiro pelo menos um funcionário."
        );

        return;
    }

    const modal =
        $("scheduleModal");

    const form =
        $("scheduleForm");

    if (!modal || !form) return;

    editingScheduleKey = null;

    form.reset();

    populateScheduleEmployees(employeeId);

    let selectedEmployee =
        employeeId
            ? normalizeId(employeeId)
            : normalizeId(
                $("scheduleEmployee")?.value
            );

    if (!selectedEmployee) {

        selectedEmployee =
            normalizeId(
                appData.employees[0].id
            );
    }

    $("scheduleEmployee").value =
        selectedEmployee;

    const selectedDate =
        dateKey ||
        formatDateKey(currentMonday);

    $("scheduleDate").value =
        selectedDate;

    const date =
        parseDateKey(selectedDate);

    if (date) {

        $("scheduleDay").value =
            `${DAY_NAMES[date.getDay()]} — ${formatShortDate(date)}`;
    }

    setVacationShortcut("current", false);

    const existing =
        getSchedule(
            selectedEmployee,
            selectedDate
        );

    if (existing) {

        editingScheduleKey =
            makeScheduleKey(
                selectedEmployee,
                selectedDate
            );

        loadScheduleIntoForm(existing);

        $("deleteScheduleButton")
            ?.classList
            .remove("hidden");

    } else {

        $("scheduleStatus").value =
            "work";

        $("break1").value =
            "0";

        $("break2").value =
            "0";

        $("toggleSecondPeriod").checked =
            false;

        $("deleteScheduleButton")
            ?.classList
            .add("hidden");
    }

    updateScheduleFields();

    updateSecondPeriodVisibility();

    openModal(modal);
}


/* =========================================================
   FÉRIAS
   ========================================================= */

function setVacationShortcut(
    type,
    showToastMessage = true
) {

    let from;
    let to;

    if (type === "next") {

        from =
            addDays(currentMonday, 7);

        to =
            addDays(currentMonday, 13);

    } else {

        from =
            currentMonday;

        to =
            addDays(currentMonday, 6);
    }

    if ($("vacationFrom")) {

        $("vacationFrom").value =
            formatDateKey(from);
    }

    if ($("vacationTo")) {

        $("vacationTo").value =
            formatDateKey(to);
    }

    if (showToastMessage) {

        showToast(
            type === "next"
                ? "Selecionada a próxima semana."
                : "Selecionada a semana atual."
        );
    }
}


function applyVacationPeriod() {

    const employeeId =
        normalizeId(
            $("scheduleEmployee")?.value
        );

    const fromValue =
        $("vacationFrom")?.value;

    const toValue =
        $("vacationTo")?.value;

    if (!employeeId) {

        showToast(
            "Seleciona um funcionário."
        );

        return;
    }

    if (!fromValue || !toValue) {

        showToast(
            "Escolhe a data inicial e a data final."
        );

        return;
    }

    const from =
        parseDateKey(fromValue);

    const to =
        parseDateKey(toValue);

    if (!from || !to) {

        showToast(
            "As datas das férias não são válidas."
        );

        return;
    }

    if (from.getTime() > to.getTime()) {

        showToast(
            "A data inicial não pode ser depois da data final."
        );

        return;
    }

    let checkDate =
        getMonday(from);

    while (
        checkDate.getTime() <=
        to.getTime()
    ) {

        if (isWeekLocked(checkDate)) {

            showToast(
                "🔒 O período escolhido inclui uma semana que já terminou e está bloqueada."
            );

            return;
        }

        checkDate =
            addDays(checkDate, 7);
    }

    const employee =
        getEmployeeById(employeeId);

    if (!employee) {

        showToast(
            "Funcionário não encontrado."
        );

        return;
    }

    const totalDays =
        Math.floor(
            (
                to.getTime() -
                from.getTime()
            ) / 86400000
        ) + 1;

    const confirmed =
        confirm(
            `Marcar ${totalDays} ${
                totalDays === 1
                    ? "dia"
                    : "dias"
            } de férias para ${
                employee.name
            }?\n\nPeríodo: ${
                formatShortDate(from)
            } — ${
                formatShortDate(to)
            }`
        );

    if (!confirmed) return;

    let current =
        new Date(from);

    let days = 0;

    while (
        current.getTime() <=
        to.getTime()
    ) {

        const dateKey =
            formatDateKey(current);

        const key =
            makeScheduleKey(
                employeeId,
                dateKey
            );

        appData.schedules[key] = {

            employeeId,
            date: dateKey,
            status: "vacation",

            start1: "",
            end1: "",
            break1: 0,

            start2: "",
            end2: "",
            break2: 0,

            notes: "Férias"
        };

        current =
            addDays(current, 1);

        days++;
    }

    saveData();

    closeScheduleModal();

    renderAll();

    showToast(
        `${days} ${
            days === 1
                ? "dia marcado"
                : "dias marcados"
        } como férias para ${
            employee.name
        }.`
    );
}


/* =========================================================
   FUNCIONÁRIOS NO MODAL
   ========================================================= */

function populateScheduleEmployees(
    selectedId = null
) {

    const select =
        $("scheduleEmployee");

    if (!select) return;

    const selected =
        selectedId
            ? normalizeId(selectedId)
            : "";

    select.innerHTML = "";

    appData.employees.forEach((employee) => {

        const option =
            document.createElement("option");

        option.value =
            normalizeId(employee.id);

        option.textContent =
            employee.name;

        select.appendChild(option);
    });

    if (
        selected &&
        appData.employees.some(
            (employee) =>
                normalizeId(employee.id) ===
                selected
        )
    ) {

        select.value = selected;

    } else if (appData.employees.length) {

        select.value =
            normalizeId(
                appData.employees[0].id
            );
    }
}


/* =========================================================
   FORM HORÁRIO
   ========================================================= */

function loadScheduleIntoForm(schedule) {

    $("scheduleStatus").value =
        schedule.status || "work";

    $("start1").value =
        schedule.start1 || "";

    $("end1").value =
        schedule.end1 || "";

    $("break1").value =
        schedule.break1 ?? 0;

    $("toggleSecondPeriod").checked =
        Boolean(
            schedule.start2 ||
            schedule.end2
        );

    $("start2").value =
        schedule.start2 || "";

    $("end2").value =
        schedule.end2 || "";

    $("break2").value =
        schedule.break2 ?? 0;

    $("scheduleNotes").value =
        schedule.notes || "";
}


function updateScheduleFields() {

    const status =
        $("scheduleStatus")?.value;

    const workFields =
        $("workFields");

    if (!workFields) return;

    workFields.classList.toggle(
        "disabled-fields",
        status !== "work"
    );
}


function updateSecondPeriodVisibility() {

    const enabled =
        $("toggleSecondPeriod")?.checked;

    $("secondPeriodFields")
        ?.classList
        .toggle(
            "hidden",
            !enabled
        );
}


/* =========================================================
   GUARDAR HORÁRIO
   ========================================================= */

function saveScheduleFromForm(event) {

    event.preventDefault();

    if (isCurrentWeekLocked()) {

        showLockedWeekToast();

        closeScheduleModal();

        return;
    }

    const employeeId =
        normalizeId(
            $("scheduleEmployee")?.value
        );

    const date =
        $("scheduleDate")?.value;

    const status =
        $("scheduleStatus")?.value;

    if (!employeeId || !date) {

        showToast(
            "Seleciona o funcionário e o dia."
        );

        return;
    }

    const selectedDate =
        parseDateKey(date);

    if (!selectedDate) {

        showToast(
            "A data selecionada não é válida."
        );

        return;
    }

    if (
        isWeekLocked(
            getMonday(selectedDate)
        )
    ) {

        showLockedWeekToast();

        return;
    }

    if (status === "work") {

        if (
            !$("start1")?.value ||
            !$("end1")?.value
        ) {

            showToast(
                "Indica a entrada e a saída."
            );

            return;
        }

        if (
            !isValidTimeRange(
                $("start1").value,
                $("end1").value
            )
        ) {

            showToast(
                "A saída tem de ser depois da entrada."
            );

            return;
        }

        if (
            $("toggleSecondPeriod")?.checked
        ) {

            if (
                !$("start2")?.value ||
                !$("end2")?.value
            ) {

                showToast(
                    "Preenche o segundo período ou desativa-o."
                );

                return;
            }

            if (
                !isValidTimeRange(
                    $("start2").value,
                    $("end2").value
                )
            ) {

                showToast(
                    "A saída do segundo período tem de ser depois da entrada."
                );

                return;
            }
        }
    }

    const newKey =
        makeScheduleKey(
            employeeId,
            date
        );

    const schedule = {

        employeeId,
        date,
        status,

        start1:
            status === "work"
                ? $("start1").value
                : "",

        end1:
            status === "work"
                ? $("end1").value
                : "",

        break1:
            status === "work"
                ? Number(
                    $("break1").value
                ) || 0
                : 0,

        start2:
            status === "work" &&
            $("toggleSecondPeriod").checked
                ? $("start2").value
                : "",

        end2:
            status === "work" &&
            $("toggleSecondPeriod").checked
                ? $("end2").value
                : "",

        break2:
            status === "work" &&
            $("toggleSecondPeriod").checked
                ? Number(
                    $("break2").value
                ) || 0
                : 0,

        notes:
            $("scheduleNotes")
                .value
                .trim()
    };

    if (
        editingScheduleKey &&
        editingScheduleKey !== newKey
    ) {

        delete appData.schedules[
            editingScheduleKey
        ];
    }

    appData.schedules[newKey] =
        schedule;

    saveData();

    closeScheduleModal();

    renderAll();

    showToast(
        "Horário guardado."
    );
}


/* =========================================================
   ELIMINAR HORÁRIO
   ========================================================= */

function deleteCurrentSchedule() {

    if (!editingScheduleKey) {
        return;
    }

    if (isCurrentWeekLocked()) {

        showLockedWeekToast();

        closeScheduleModal();

        return;
    }

    if (
        !confirm(
            "Eliminar este horário?"
        )
    ) {
        return;
    }

    delete appData.schedules[
        editingScheduleKey
    ];

    saveData();

    closeScheduleModal();

    renderAll();

    showToast(
        "Horário eliminado."
    );
}


/* =========================================================
   HISTÓRICO
   ========================================================= */

function getHistoricalWeeks() {

    const weeks = {};

    Object.values(appData.schedules).forEach(
        (schedule) => {

            if (
                !schedule ||
                !schedule.date
            ) {
                return;
            }

            const date =
                parseDateKey(schedule.date);

            if (!date) return;

            const monday =
                getMonday(date);

            if (!isWeekLocked(monday)) {
                return;
            }

            const mondayKey =
                formatDateKey(monday);

            if (!weeks[mondayKey]) {

                weeks[mondayKey] = {
                    monday,
                    schedules: []
                };
            }

            weeks[mondayKey]
                .schedules
                .push(schedule);
        }
    );

    return Object.values(weeks).sort(
        (a, b) =>
            b.monday.getTime() -
            a.monday.getTime()
    );
}


function renderHistory() {

    const list =
        $("historyList");

    const empty =
        $("emptyHistoryState");

    const count =
        $("historyWeekCount");

    const filter =
        $("historyMonthFilter");

    if (!list || !empty) {
        return;
    }

    const weeks =
        getHistoricalWeeks();

    if (filter) {

        const currentFilter =
            filter.value || "all";

        const monthKeys =
            new Set();

        weeks.forEach((week) => {

            const info =
                getWeekInfo(week.monday);

            monthKeys.add(
                `${info.year}-${String(
                    info.month + 1
                ).padStart(2, "0")}`
            );
        });

        filter.innerHTML = "";

        const allOption =
            document.createElement("option");

        allOption.value = "all";
        allOption.textContent = "Todos os meses";

        filter.appendChild(allOption);

        Array.from(monthKeys)
            .sort()
            .reverse()
            .forEach((key) => {

                const [
                    year,
                    month
                ] = key.split("-").map(Number);

                const option =
                    document.createElement("option");

                option.value = key;

                option.textContent =
                    `${MONTH_NAMES[month - 1]} ${year}`;

                filter.appendChild(option);
            });

        if (
            currentFilter === "all" ||
            monthKeys.has(currentFilter)
        ) {

            filter.value =
                currentFilter;

        } else {

            filter.value =
                "all";
        }
    }

    const selectedFilter =
        filter?.value || "all";

    const filteredWeeks =
        weeks.filter((week) => {

            if (selectedFilter === "all") {
                return true;
            }

            const info =
                getWeekInfo(week.monday);

            const key =
                `${info.year}-${String(
                    info.month + 1
                ).padStart(2, "0")}`;

            return key === selectedFilter;
        });

    list.innerHTML = "";

    if (count) {
        count.textContent =
            filteredWeeks.length;
    }

    if (filteredWeeks.length === 0) {

        empty.classList.add("visible");

        return;
    }

    empty.classList.remove("visible");

    let lastMonthKey = "";

    filteredWeeks.forEach((week) => {

        const info =
            getWeekInfo(week.monday);

        const monthKey =
            `${info.year}-${info.month}`;

        if (monthKey !== lastMonthKey) {

            const monthTitle =
                document.createElement("div");

            monthTitle.className =
                "history-month-title";

            monthTitle.textContent =
                `${info.monthName} ${info.year}`;

            list.appendChild(monthTitle);

            lastMonthKey =
                monthKey;
        }

        const dates =
            getWeekDates(week.monday);

        const employeeIds =
            new Set(
                week.schedules.map(
                    (schedule) =>
                        normalizeId(
                            schedule.employeeId
                        )
                )
            );

        const totalMinutes =
            week.schedules.reduce(
                (total, schedule) =>
                    total +
                    calculateScheduleMinutes(schedule),
                0
            );

        const card =
            document.createElement("article");

        card.className =
            "history-card";

        const mondayKey =
            formatDateKey(week.monday);

        card.innerHTML = `
            <div class="history-card-top">
                <div>
                    <span class="history-card-kicker">
                        ARQUIVADO
                    </span>

                    <h3>
                        ${info.monthName}
                    </h3>
                </div>

                <span class="history-lock">
                    🔒
                </span>
            </div>

            <div class="history-card-range">
                ${formatShortDate(dates[0])}
                —
                ${formatShortDate(dates[6])}
            </div>

            <div class="history-card-stats">

                <div class="history-stat">
                    <span>
                        Funcionários
                    </span>

                    <strong>
                        ${employeeIds.size}
                    </strong>
                </div>

                <div class="history-stat">
                    <span>
                        Horas
                    </span>

                    <strong>
                        ${formatMinutes(totalMinutes)}
                    </strong>
                </div>

            </div>

            <button
                type="button"
                class="history-view-button"
                data-history-week="${mondayKey}"
            >
                Ver horário
            </button>
        `;

        list.appendChild(card);
    });

    list
        .querySelectorAll("[data-history-week]")
        .forEach((button) => {

            button.addEventListener("click", () => {

                const monday =
                    parseDateKey(
                        button.dataset.historyWeek
                    );

                if (!monday) {
                    return;
                }

                currentMonday =
                    monday;

                showSection("schedule");

                renderWeek();

                showToast(
                    "🔒 Semana histórica aberta em modo de consulta."
                );
            });
        });
}


/* =========================================================
   RESUMO
   ========================================================= */

function updateSummary() {

    let totalMinutes = 0;
    let daysOff = 0;

    const filter =
        $("employeeFilter")?.value ||
        "all";

    const employees =
        filter === "all"
            ? appData.employees
            : appData.employees.filter(
                (employee) =>
                    normalizeId(employee.id) ===
                    normalizeId(filter)
            );

    const dates =
        getWeekDates(currentMonday);

    employees.forEach((employee) => {

        dates.forEach((date) => {

            const schedule =
                getSchedule(
                    employee.id,
                    formatDateKey(date)
                );

            if (!schedule) {
                return;
            }

            totalMinutes +=
                calculateScheduleMinutes(schedule);

            if (
                schedule.status === "off"
            ) {
                daysOff++;
            }
        });
    });

    if ($("totalTeamHours")) {

        $("totalTeamHours").textContent =
            formatMinutes(totalMinutes);
    }

    if ($("totalEmployees")) {

        $("totalEmployees").textContent =
            employees.length;
    }

    if ($("totalDaysOff")) {

        $("totalDaysOff").textContent =
            daysOff;
    }
}


/* =========================================================
   CÁLCULOS
   ========================================================= */

function calculateScheduleMinutes(schedule) {

    if (
        !schedule ||
        schedule.status !== "work"
    ) {
        return 0;
    }

    let total = 0;

    total +=
        calculatePeriodMinutes(
            schedule.start1,
            schedule.end1,
            schedule.break1
        );

    total +=
        calculatePeriodMinutes(
            schedule.start2,
            schedule.end2,
            schedule.break2
        );

    return Math.max(0, total);
}


function calculatePeriodMinutes(
    start,
    end,
    breakMinutes = 0
) {

    if (!start || !end) {
        return 0;
    }

    const startMinutes =
        timeToMinutes(start);

    const endMinutes =
        timeToMinutes(end);

    if (
        startMinutes === null ||
        endMinutes === null ||
        endMinutes <= startMinutes
    ) {
        return 0;
    }

    return Math.max(
        0,
        endMinutes -
        startMinutes -
        Number(breakMinutes || 0)
    );
}


function timeToMinutes(value) {

    if (
        !value ||
        !value.includes(":")
    ) {
        return null;
    }

    const [
        hours,
        minutes
    ] =
        value.split(":").map(Number);

    if (
        Number.isNaN(hours) ||
        Number.isNaN(minutes)
    ) {
        return null;
    }

    return (
        hours * 60 +
        minutes
    );
}


function formatMinutes(minutes) {

    const safe =
        Math.max(
            0,
            Number(minutes) || 0
        );

    const hours =
        Math.floor(safe / 60);

    const mins =
        safe % 60;

    if (mins === 0) {
        return `${hours}h`;
    }

    return `${hours}h ${String(mins).padStart(2, "0")}`;
}


function formatHoursNumber(value) {

    const number =
        Number(value) || 0;

    return Number.isInteger(number)
        ? String(number)
        : number.toFixed(1);
}


/* =========================================================
   ANIVERSÁRIOS
   ========================================================= */

function isBirthday(employee, date) {

    if (
        !employee ||
        !employee.birthDate
    ) {
        return false;
    }

    const birth =
        parseDateKey(employee.birthDate);

    if (
        !birth ||
        Number.isNaN(birth.getTime())
    ) {
        return false;
    }

    return (
        birth.getDate() === date.getDate() &&
        birth.getMonth() === date.getMonth()
    );
}


function formatBirthDate(value) {

    if (!value) {
        return "Sem data de nascimento";
    }

    const date =
        parseDateKey(value);

    if (!date) {
        return value;
    }

    return `${String(date.getDate()).padStart(2, "0")}/${String(
        date.getMonth() + 1
    ).padStart(2, "0")}/${date.getFullYear()}`;
}


/* =========================================================
   DATAS
   ========================================================= */

function getMonday(date) {

    const result =
        new Date(date);

    result.setHours(
        0,
        0,
        0,
        0
    );

    const day =
        result.getDay();

    const difference =
        day === 0
            ? -6
            : 1 - day;

    result.setDate(
        result.getDate() + difference
    );

    return result;
}


function addDays(date, amount) {

    const result =
        new Date(date);

    result.setDate(
        result.getDate() + amount
    );

    return result;
}


function getWeekDates(monday) {

    return Array.from(
        { length: 7 },
        (_, index) =>
            addDays(monday, index)
    );
}


function formatDateKey(date) {

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getDate()
        ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function parseDateKey(value) {

    if (!value) {
        return null;
    }

    const parts =
        String(value)
            .split("-")
            .map(Number);

    if (
        parts.length !== 3 ||
        parts.some(Number.isNaN)
    ) {
        return null;
    }

    const date =
        new Date(
            parts[0],
            parts[1] - 1,
            parts[2]
        );

    date.setHours(
        0,
        0,
        0,
        0
    );

    if (
        date.getFullYear() !== parts[0] ||
        date.getMonth() !== parts[1] - 1 ||
        date.getDate() !== parts[2]
    ) {
        return null;
    }

    return date;
}


function formatShortDate(date) {

    return `${String(
        date.getDate()
    ).padStart(2, "0")}/${String(
        date.getMonth() + 1
    ).padStart(2, "0")}`;
}


function formatWeekRange(dates) {

    if (!dates.length) {
        return "";
    }

    return `${formatShortDate(dates[0])} — ${formatShortDate(dates[6])}`;
}


/* =========================================================
   STORAGE DE HORÁRIOS
   ========================================================= */

function makeScheduleKey(employeeId, date) {

    return `${normalizeId(employeeId)}__${date}`;
}


function getSchedule(employeeId, date) {

    return (
        appData.schedules[
            makeScheduleKey(
                employeeId,
                date
            )
        ] || null
    );
}


function getEmployeeById(id) {

    const normalized =
        normalizeId(id);

    return (
        appData.employees.find(
            (employee) =>
                normalizeId(employee.id) ===
                normalized
        ) || null
    );
}


function normalizeId(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value);
}


function generateId() {

    return (
        Date.now().toString(36) +
        Math.random()
            .toString(36)
            .slice(2, 8)
    );
}


/* =========================================================
   VALIDAÇÃO
   ========================================================= */

function isValidTimeRange(start, end) {

    const startMinutes =
        timeToMinutes(start);

    const endMinutes =
        timeToMinutes(end);

    return (
        startMinutes !== null &&
        endMinutes !== null &&
        endMinutes > startMinutes
    );
}


/* =========================================================
   MODAIS
   ========================================================= */

function openModal(modal) {

    if (!modal) return;

    modal.classList.add("open");

    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    document.body.classList.add(
        "modal-open"
    );
}


function closeModal(modal) {

    if (!modal) return;

    modal.classList.remove("open");

    modal.setAttribute(
        "aria-hidden",
        "true"
    );

    if (
        document.querySelectorAll(
            ".modal.open"
        ).length === 0
    ) {

        document.body.classList.remove(
            "modal-open"
        );
    }
}


function closeEmployeeModal() {

    closeModal(
        $("employeeModal")
    );

    editingEmployeeId = null;
}


function closeScheduleModal() {

    closeModal(
        $("scheduleModal")
    );

    editingScheduleKey = null;
}


/* =========================================================
   IMPRESSÃO / PDF
   ========================================================= */

function printSchedule() {

    if (appData.employees.length === 0) {

        showToast(
            "Adiciona pelo menos um funcionário antes de imprimir."
        );

        return;
    }

    document
        .querySelectorAll(".modal.open")
        .forEach(closeModal);

    window.print();
}


/* =========================================================
   UTILITÁRIOS
   ========================================================= */

function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(message) {

    const toast =
        $("toast");

    if (!toast) return;

    clearTimeout(toastTimeout);

    toast.textContent =
        message;

    toast.classList.add("visible");

    toastTimeout =
        setTimeout(
            () =>
                toast.classList.remove("visible"),
            2800
        );
}


/* =========================================================
   SERVICE WORKER
   ========================================================= */

function registerServiceWorker() {

    if (!("serviceWorker" in navigator)) {
        return;
    }

    window.addEventListener("load", () => {

        navigator.serviceWorker
            .register(
                "./service-worker.js?v=20260920"
            )
            .then((registration) => {

                registration.update();
            })
            .catch((error) => {

                console.error(
                    "Service Worker:",
                    error
                );
            });
    });
}