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
    },

    start: function () {
        this.initTheme();
        this.handleSession();
        this.handleLastSelect();
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
    },
    _onThemeSelectChange: function (ev) {
        let selectedTheme = $(ev.currentTarget).val();
        this.setTheme(selectedTheme);
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
        this.$selector
            .find(
                "select[name='service'] > option[value='%s']".replace(
                    "%s",
                    localStorage.getItem("selectedService"),
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
    },
});

Nedara.registerWidget("lwsMain", lwsMain);
