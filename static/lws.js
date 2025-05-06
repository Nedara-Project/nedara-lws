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
    },

    start: function () {
        this.initTheme();
        this.handleSession();
        this.handleLastSelect();
        this.initMonacoEditor();
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
                self.toggleLoader();
            },
            error: function (xhr, status, error) {
                console.error("Error:", error);
                self.toggleLoader();
            },
        });
    },
    _onServiceSelectChange: function (ev) {
        let selectedService = $(ev.currentTarget).find(":selected").val();
        localStorage.setItem("selectedService", selectedService);
        // Load file content for the selected service
        this.loadFileContent(selectedService);
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
                    self.$selector.find(".status_block").show();
                    self.$selector
                        .find(".service_status")
                        .text(response.message);
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
        // Load file content for the initial service
        if (selectedService) {
            this.loadFileContent(selectedService);
        }
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
    },
    initMonacoEditor: function () {
        let self = this;
        // Make sure Monaco is loaded
        if (typeof monaco === 'undefined') {
            // Use require.config to load Monaco
            require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.37.1/min/vs' }});
            require(['vs/editor/editor.main'], function () {
                self.createEditor();
            });
        } else {
            this.createEditor();
        }
    },
    createEditor: function () {
        // Create the Monaco editor instance
        this.editor = monaco.editor.create(document.getElementById('monaco-editor-container'), {
            value: "",
            language: "plaintext",
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
        // Load the file for the initially selected service
        let initialService = this.$selector.find("select[name='service'] > option:selected").val();
        if (initialService) {
            this.loadFileContent(initialService);
        }
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
        if (!serviceKey || !this.editor) {
            return;
        };
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
                self.toggleLoader();
                if (response.status === "success") {
                    // Set the file content to the editor
                    self.editor.setValue(response.content);
                    // Set the language mode based on file extension
                    const filePath = response.file_path;
                    self.$selector.find(".file-path").text(filePath);
                    self.setEditorLanguage(filePath);
                    // Show the editor block
                    if (filePath) {
                        self.$selector.find(".file_editor_block").show();
                    }
                } else {
                    console.error("Error loading file:", response.error);
                    self.$selector.find(".file_editor_block").hide();
                }
            },
            error: function (xhr, status, error) {
                console.error("Error loading file:", error);
                self.toggleLoader();
                self.$selector.find(".file_editor_block").hide();
            },
        });
    },
    setEditorLanguage: function (filePath) {
        if (!filePath) {
            return;
        };
        // Determine language based on file extension
        const fileExtension = filePath.split('.').pop().toLowerCase();
        let language = "plaintext";
        // Map common file extensions to Monaco languages
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
            language = extensionMap[fileExtension];
        } else if (filePath.includes("nginx")) {
            language = "nginx";
        }
        const model = this.editor.getModel();
        monaco.editor.setModelLanguage(model, language);
    },
});

Nedara.registerWidget("lwsMain", lwsMain);
