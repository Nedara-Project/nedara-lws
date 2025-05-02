"use strict";

import Nedara from "/static/lib/nedara/nedara.min.js";

const lwsMain = Nedara.createWidget({
    selector: "body",
    events: {
        "click button.submit_password": "_onPasswordSubmit",
        "change select[name='service']": "_onServiceSelectChange",
        "click a.toggle_theme_btn": "_onToggleThemeBtnClick",
        "click div.service_control > button": "_onServiceControlBtnClick",
    },

    start: function () {
        this.setTheme();
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
    _onToggleThemeBtnClick: function () {
        let $html = this.$container.find("html");
        let themeAttr = $html.attr("data-theme");
        let theme = themeAttr === 'light' ? 'dark' : 'light';
        $html.attr("data-theme", theme);
        localStorage.setItem("theme", theme);
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
                service: self.$selector.find("select > option:selected").val(),
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
    },
    setTheme: function () {
        let theme = localStorage.getItem("theme");
        if (theme) {
            this.$container.find("html").attr("data-theme", theme);
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
