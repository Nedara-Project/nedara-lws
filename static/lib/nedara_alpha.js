"use strict";

// TODO: Should follow Nedara project and use the release version (when released)

const Nedara = (function ($) {
    const widgets = {};
    let templateDoc = null;

    // ************************************************************
    // * PRIVATE
    // ************************************************************

    /**
     * @private
     * @param {String} id
     * @returns
     */
    function _getTemplate(id) {
        if (!templateDoc) {
            console.error("Templates were not imported");
            return null;
        }
        const template = templateDoc.getElementById(id);
        if (!template) {
            console.error(`Template with ID "${id}" was not found`);
            return null;
        }
        return template.innerHTML;
    }

    // ************************************************************
    // * PUBLIC
    // ************************************************************

    /**
     * @public
     * @param {String} url
     * @returns
     */
    async function importTemplates(url) {
        try {
            const response = await fetch(url);
            const html = await response.text();
            const parser = new DOMParser();
            templateDoc = parser.parseFromString(html, "text/html");
        } catch (error) {
            console.error("Error while importing template:", error);
        }
    }

    /**
     * @public
     * @param {String} id
     * @param {Object} data
     * @returns
     */
    function renderTemplate(id, data = {}) {
        const templateContent = _getTemplate(id);
        if (!templateContent) {
            return "";
        }
        let renderedContent = templateContent.replace(
            /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
            (match, key, section) => {
                if (!Array.isArray(data[key])) {
                    return "";
                }
                return data[key]
                    .map((item) => {
                        return section.replace(
                            /\{\{(\w+)\}\}/g,
                            (match, variable) => {
                                return item.hasOwnProperty(variable)
                                    ? item[variable]
                                    : match;
                            },
                        );
                    })
                    .join("");
            },
        );
        renderedContent = renderedContent.replace(
            /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
            (match, condition, section) => {
                const conditionResult = data[condition];
                if (conditionResult) {
                    const ifSection = section.split("{{else}}")[0];
                    return ifSection.trim();
                } else if (section.includes("{{else}}")) {
                    const elseSection = section.split("{{else}}")[1];
                    return elseSection.trim();
                }
                return "";
            },
        );
        renderedContent = renderedContent.replace(
            /\{\{(\w+)\}\}/g,
            (match, key) => {
                return data.hasOwnProperty(key) ? data[key] : match;
            },
        );
        return renderedContent;
    }

    /**
     * @public
     * @param {String} name
     * @param {Object} widgetObject
     */
    function registerWidget(name, widgetObject) {
        widgets[name] = widgetObject;
    }

    /**
     * @public
     * @param {Object} options
     * @returns
     */
    function createWidget(options) {
        const defaultOptions = {
            container: document,
            selector: "",
            events: {},
            start: function () {},
            end: function () {},
        };
        const widget = {
            ...defaultOptions,
            ...options,
            init: function () {
                this._bindEvents();
                if (this._checkSelectorAndContainer()) {
                    this.$container = $(this.container);
                    this.$selector = $(this.selector);
                    this.start();
                }
            },
            _checkSelectorAndContainer: function () {
                const $container = $(this.container);
                return (
                    $container.length &&
                    (this.selector === "" ||
                        $container.find(this.selector).length)
                );
            },
            _bindEvents: function () {
                const self = this;
                const $container = $(this.container);
                Object.keys(this.events || {}).forEach((key) => {
                    const [eventName, selector] = key.split(" ");
                    const handler = this[this.events[key]];
                    if (handler) {
                        $container.on(
                            eventName,
                            this.selector + (selector ? " " + selector : ""),
                            function (e) {
                                handler.call(self, e);
                            },
                        );
                    }
                });
            },
            refresh: function () {
                this._bindEvents();
            },
            destroy: function () {
                this.end();
                const $container = $(this.container);
                Object.keys(this.events || {}).forEach((key) => {
                    const [eventName, selector] = key.split(" ");
                    $container.off(
                        eventName,
                        this.selector + (selector ? " " + selector : ""),
                    );
                });
            },
        };
        widget.init();
        return widget;
    }

    return {
        widgets: widgets,
        registerWidget: registerWidget,
        createWidget: createWidget,
        importTemplates: importTemplates,
        renderTemplate: renderTemplate,
        registeredWidgets: widgets,
    };
})(jQuery);

export default Nedara;
