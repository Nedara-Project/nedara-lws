"use strict";

import Nedara from "/static/lib/nedara/nedara.min.js";

const lwsMain = Nedara.createWidget({
    selector: "body",
    events: {
        "click button.submit_password": "_onPasswordSubmit",
        "change select[name='service']": "_onServiceSelectChange",
        "change select.theme-select": "_onThemeSelectChange",
        "click div.service_control > button": "_onServiceControlBtnClick",
        "click button[value='system_info']": "_onSystemInfoBtnClick",
        "click button.save-file": "_onSaveFileBtnClick",
        "click button.reload-file": "_onReloadFileBtnClick",
        "click button.open-editor": "_onOpenEditorClick",
        "click button.close-editor": "_onCloseEditorClick",
        "click #add-schedule": "_onAddScheduleClick",
        "click .delete-schedule": "_onDeleteScheduleClick",
    },

    start: function () {
        this.initTheme();
        this.handleSession();
        this.handleLastSelect();
        this.loadFile();

        this.socket = io();

        this.socket.on('connect', () => {
            this.loadInitialData();
        });

        this.socket.on('schedules_data', (data) => {
            this.updateSchedulesTable(data);
        });

        this.socket.on('schedule_updated', (data) => {
            if (data.service === this.getSelectedService()) {
                this.loadSchedules(data.service);
            }
        });

        this.socket.on('schedule_deleted', (data) => {
            this.$selector.find(`tr[data-schedule-id="${data.schedule_id}"]`).remove();
        });

        this.socket.on('error', (data) => {
            confirm(data.message);
        });
    },

    // ************************************************************
    // * Handlers
    // ************************************************************

    _onPasswordSubmit: function () {
        let self = this;
        let password = this.$selector.find('[name="password"]').val();
        this.toggleLoader();
        $.ajax({
            url: "/lws/auth",
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify({ password: password }),
            success: function (response) {
                let $success = self.$selector.find(".success_auth");
                let $error = self.$selector.find(".error_auth");
                if (response.status === "success") {
                    localStorage.setItem("session_id", response.session_id);
                    $success.show();
                    $error.hide();
                    self.$selector.find("div.login").hide();
                    self.showBlocks();
                } else if (response.status === "error") {
                    $error.show();
                    $success.hide();
                }
                self.loadFile();
                self.toggleLoader();
            },
            error: function (xhr, status, error) {
                console.error("Error:", error);
                self.toggleLoader();
            },
        });
    },
    _onServiceSelectChange: function (ev) {
        const selectedService = $(ev.currentTarget).find(":selected").val();
        localStorage.setItem("selectedService", selectedService);
        this.loadFileContent(selectedService);
        if (this.socket.connected) {
            this.socket.emit('get_schedules', {
                session_id: localStorage.getItem("session_id"),
                service: selectedService,
            });
        }
    },
    _onThemeSelectChange: function (ev) {
        let selectedTheme = $(ev.currentTarget).val();
        this.setTheme(selectedTheme);
        // Update Monaco editor theme accordingly
        if (this.editor) {
            this.editor.updateOptions({
                theme: selectedTheme === 'dark' ? 'vs-dark' : 'vs',
            });
        }
    },
    _onServiceControlBtnClick: function (ev) {
        let self = this;
        this.toggleLoader();
        $.ajax({
            url: "/lws/action",
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                session_id: localStorage.getItem("session_id"),
                action: $(ev.originalEvent.target).val(),
                service: self.$selector.find("select[name='service'] > option:selected").val(),
            }),
            success: function (response) {
                if (response.status === "success") {
                    const $statusBlock = self.$selector.find(".status_block");
                    $statusBlock.show();
                    self.$selector
                        .find(".service_status")
                        .text(response.message);
                    $('html, body').animate({
                        scrollTop: $statusBlock.offset().top - 20,
                    }, 400, 'swing');
                }
                self.toggleLoader();
            },
            error: function (xhr, status, error) {
                console.error("Error:", error);
                self.toggleLoader();
            },
        });
    },
    _onSystemInfoBtnClick: function () {
        let self = this;
        this.toggleLoader();
        $.ajax({
            url: "/lws/get_system_info",
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify({}),
            success: function (response) {
                self.toggleLoader();
                const info = response.system_info;
                const tableBody = $("#system-info-table tbody");
                tableBody.empty(); // Clear previous data
                const dataRows = [
                    ["Total Virtual Memory", `${info.total_virtual_memory_gb} Gio`],
                    ["Virtual Memory Used", `${info.virtual_memory_usage_gb} Gio`],
                    ["Virtual Memory Usage", `${info.virtual_memory_usage_percentage}%`],
                    ["CPU Usage", `${info.cpu_usage_percentage}%`],
                    ["Swap Memory Used", `${info.swap_memory_usage_gb} Gio`],
                    ["Swap Memory Usage", `${info.swap_memory_usage_percentage}%`],
                ];
                dataRows.forEach(([label, value]) => {
                    tableBody.append(`
                        <tr>
                            <td>${label}</td>
                            <td>${value}</td>
                        </tr>
                    `);
                });
                $(".system-stats").show();
            },
            error: function (xhr, status, error) {
                console.error("Error:", error);
                self.toggleLoader();
            },
        });
    },
    _onSaveFileBtnClick: function () {
        let self = this;
        let selectedService = this.$selector.find("select[name='service'] > option:selected").val();
        let fileContent = this.editor.getValue();
        this.toggleLoader();
        this.$selector.find(".save-success").hide();
        this.$selector.find(".save-error").hide();
        $.ajax({
            url: "/lws/save_file_content",
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                session_id: localStorage.getItem("session_id"),
                service: selectedService,
                content: fileContent,
            }),
            success: function (response) {
                self.toggleLoader();
                if (response.status === "success") {
                    self.$selector.find(".save-success").show();
                    setTimeout(() => {
                        self.$selector.find(".save-success").fadeOut();
                    }, 3000);
                } else {
                    self.$selector.find(".save-error").show();
                    self.$selector.find(".error-message").text(response.error || "Unknown error");
                }
            },
            error: function (xhr, status, error) {
                console.error("Error saving file:", error);
                self.toggleLoader();
                self.$selector.find(".save-error").show();
                self.$selector.find(".error-message").text(error || "Unknown error");
            },
        });
    },
    _onReloadFileBtnClick: function () {
        let selectedService = this.$selector.find("select[name='service'] > option:selected").val();
        this.loadFileContent(selectedService);
    },
    _onOpenEditorClick: function () {
        document.body.style.overflow = 'hidden';
        this.$selector.find('.fullscreen-editor').show();
        this.$selector.find('.navbar').hide();
        this.$selector.find('main').hide();
        this.$selector.find('.editor-file-path').text(this.$selector.find('.file-path').text());
        if (this.editor) {
            this.editor.layout();
        }
    },
    _onCloseEditorClick: function () {
        document.body.style.overflow = '';
        this.$selector.find('.fullscreen-editor').hide();
        this.$selector.find('.navbar').show();
        this.$selector.find('main').show();
    },
    _onAddScheduleClick: function () {
        const scheduleText = this.$selector.find("#schedule-input").val();
        const operation = this.$selector.find("#operation-select").val();
        const service = this.getSelectedService();

        if (!scheduleText) {
            confirm("Please enter a schedule");
            return;
        }

        this.socket.emit('save_schedule', {
            session_id: localStorage.getItem("session_id"),
            service: service,
            schedule_text: scheduleText,
            operation: operation,
        });

        this.$selector.find("#schedule-input").val("");
    },
    _onDeleteScheduleClick: function (ev) {
        const scheduleId = $(ev.currentTarget).data("schedule-id");

        if (confirm("Are you sure you want to delete this schedule ?")) {
            this.socket.emit('delete_schedule', {
                session_id: localStorage.getItem("session_id"),
                schedule_id: scheduleId,
            });
        }
    },

    // ************************************************************
    // * Functions
    // ************************************************************

    handleSession: function () {
        let self = this;
        this.toggleLoader();
        $.ajax({
            url: "/lws/check_auth",
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                session_id: localStorage.getItem("session_id"),
            }),
            success: function (response) {
                if (response.is_authenticated) {
                    self.$selector.find(".success_auth").show();
                    self.$selector.find(".error_auth").hide();
                    self.$selector.find("div.login").hide();
                    self.showBlocks();
                }
                self.toggleLoader();
            },
            error: function (xhr, status, error) {
                console.error("Error:", error);
                self.toggleLoader();
            },
        });
    },
    handleLastSelect: function () {
        let selectedService = localStorage.getItem("selectedService");
        this.$selector
            .find(
                "select[name='service'] > option[value='%s']".replace(
                    "%s",
                    selectedService,
                ),
            )
            .prop("selected", true);
        let savedTheme = localStorage.getItem("theme") || "auto";
        this.$selector.find(".theme-select").val(savedTheme);
    },
    initTheme: function () {
        let theme = localStorage.getItem("theme");
        if (!theme) {
            theme = "auto";
            localStorage.setItem("theme", theme);
        }
        this.setTheme(theme);
    },
    setTheme: function (theme) {
        localStorage.setItem("theme", theme);
        this.$container.find("html").attr("data-theme", theme);
        const $icon = this.$selector.find(".theme-icon");
        if (theme === "light") {
            $icon.removeClass("fa-moon fa-adjust").addClass("fa-sun");
        } else if (theme === "dark") {
            $icon.removeClass("fa-sun fa-adjust").addClass("fa-moon");
        } else { // auto
            $icon.removeClass("fa-sun fa-moon").addClass("fa-adjust");
        }
    },
    toggleLoader: function () {
        this.$selector.find("div.loader").toggle();
    },
    showBlocks: function () {
        this.$selector.find(".service_block").show();
        this.$selector.find(".system_block").show();
        this.$selector.find(".control_block").show();
        this.$selector.find(".login_block").hide();
    },
    initMonacoEditor: function (initialContent = "", filePath = "") {
        let self = this;
        // Make sure Monaco is loaded
        if (typeof monaco === 'undefined') {
            // Use require.config to load Monaco
            require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.37.1/min/vs' }});
            require(['vs/editor/editor.main'], function () {
                self.createEditor(initialContent, filePath);
            });
        } else {
            this.createEditor(initialContent, filePath);
        }
    },
    createEditor: function (initialContent = "", filePath = "") {
        // Create the Monaco editor instance
        this.editor = monaco.editor.create(document.getElementById('monaco-editor-container'), {
            value: initialContent,
            language: this.getLanguageFromFilePath(filePath),
            theme: this.getMonacoTheme(),
            automaticLayout: true,
            scrollBeyondLastLine: false,
            minimap: { enabled: true },
            lineNumbers: "on",
            glyphMargin: true,
            folding: true,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 3,
        });
        window.addEventListener('resize', this.editor.layout.bind(this.editor));
    },
    getMonacoTheme: function () {
        let theme = localStorage.getItem("theme") || "auto";
        if (theme === "dark") {
            return "vs-dark";
        } else if (theme === "light") {
            return "vs";
        } else { // auto
            // Check system preference
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return "vs-dark";
            } else {
                return "vs";
            }
        }
    },
    loadFileContent: function (serviceKey) {
        let self = this;
        if (!serviceKey) {
            return;
        }
        this.toggleLoader();
        $.ajax({
            url: "/lws/get_file_content",
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                session_id: localStorage.getItem("session_id"),
                service: serviceKey,
            }),
            success: function (response) {
                self.resetEditorPosition();
                self.toggleLoader();
                if (response.status === "success") {
                    const filePath = response.file_path;
                    self.$selector.find(".file-path").text(filePath);
                    self.$selector.find(".editor-file-path").text(filePath);
                    if (filePath) {
                        self.$selector.find(".no-file-message").hide();
                        self.$selector.find(".file-available").show();
                        if (self.editor) {
                            self.editor.setValue(response.content);
                            self.setEditorLanguage(filePath);
                        } else {
                            self.initMonacoEditor(response.content, filePath);
                        }
                    } else {
                        self.$selector.find(".no-file-message").show();
                        self.$selector.find(".file-available").hide();
                    }
                } else {
                    console.error("Error loading file:", response.error);
                    self.$selector.find(".no-file-message").show();
                    self.$selector.find(".file-available").hide();
                }
            },
            error: function (xhr, status, error) {
                console.error("Error loading file:", error);
                self.toggleLoader();
                self.$selector.find(".no-file-message").show();
                self.$selector.find(".file-available").hide();
            },
        });
    },
    setEditorLanguage: function (filePath) {
        if (!filePath || !this.editor) {
            return;
        }
        const language = this.getLanguageFromFilePath(filePath);
        const model = this.editor.getModel();
        monaco.editor.setModelLanguage(model, language);
    },
    getLanguageFromFilePath: function (filePath) {
        if (!filePath) {
            return "plaintext";
        }
        const fileExtension = filePath.split('.').pop().toLowerCase();
        const extensionMap = {
            "js": "javascript",
            "py": "python",
            "html": "html",
            "css": "css",
            "json": "json",
            "md": "markdown",
            "xml": "xml",
            "conf": "ini",
            "ini": "ini",
            "sh": "shell",
            "bash": "shell",
            "sql": "sql",
            "php": "php",
            "java": "java",
            "c": "c",
            "cpp": "cpp",
            "cs": "csharp",
            "go": "go",
            "ts": "typescript",
            "yaml": "yaml",
            "yml": "yaml",
        };
        if (extensionMap[fileExtension]) {
            return extensionMap[fileExtension];
        } else if (filePath.includes("nginx")) {
            return "nginx";
        }
        return "plaintext";
    },
    loadFile: function () {
        // Load file content for the initial service
        let selectedService = this.$selector.find("select[name='service'] > option:selected").val();
        if (selectedService) {
            this.loadFileContent(selectedService);
        }
    },
    resetEditorPosition: function () {
        if (this.editor) {
            this.editor.setPosition({ lineNumber: 1, column: 1 });
            this.editor.revealPositionInCenter({ lineNumber: 1, column: 1 });
            this.editor.setScrollPosition({ scrollTop: 0 });
        }
    },
    getSelectedService: function () {
        return this.$selector.find("select[name='service'] > option:selected").val();
    },
    loadInitialData: function () {
        const service = this.getSelectedService();
        if (service) {
            this.socket.emit('get_schedules', {
                session_id: localStorage.getItem("session_id"),
                service: service,
            });
        }
    },
    updateSchedulesTable: function (data) {
        const tbody = this.$selector.find("#schedules-table-body");
        tbody.empty();
        if (data.schedules.length === 0) {
            tbody.append(`
                <tr>
                    <td colspan="3" class="text-center text-muted">
                        No scheduled operations for this service.
                    </td>
                </tr>
            `);
            return;
        }
        data.schedules.forEach(schedule => {
            tbody.append(`
                <tr data-schedule-id="${schedule.id}">
                    <td>${schedule.schedule_text}</td>
                    <td>${schedule.operation}</td>
                    <td>
                        <button class="btn btn-sm btn-danger delete-schedule"
                                data-schedule-id="${schedule.id}">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </td>
                </tr>
            `);
        });
    },
    loadSchedules: function (serviceKey) {
        if (!serviceKey) {
            return;
        }

        if (!this.socket || !this.socket.connected) {
            console.error("Socket.IO not connected");
            return;
        }

        this.socket.emit('get_schedules', {
            session_id: localStorage.getItem("session_id"),
            service: serviceKey,
        });
    },
});

Nedara.registerWidget("lwsMain", lwsMain);
