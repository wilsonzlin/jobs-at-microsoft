"use strict";

(() => {
  /*
   *  COMPATIBILITY
   */
  const COMPAT_TEMPLATE = !!window.HTMLTemplateElement;
  const import_template = $template =>
    (COMPAT_TEMPLATE ? $template_search_term.content : $template_search_term).cloneNode(true).children[0];
  if (!HTMLElement.prototype.remove) {
    HTMLElement.prototype.remove = function () {
      this.parentNode.removeChild(this);
    };
  }
  if (!Object.assign) {
    Object.assign = function () {
      const dest = arguments[0];
      for (let i = 1; i < arguments.length; i++) {
        const src = arguments[i];
        for (const key of Object.keys(src)) {
          dest[key] = src[key];
        }
      }
      return dest;
    };
  }
  if (!Array.from) {
    Array.from = src => Array.prototype.slice.call(src);
  }

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const $pane = $("#pane");
  const $pane_toggle_button = $("#pane-toggle-button");
  $pane_toggle_button.addEventListener("click", () => {
    $pane.classList.toggle("pane-open");
  });

  const $$search_category_buttons = $$(".search-category-button");
  const $template_search_term = $("#template-search-term");
  for (const $button of $$search_category_buttons) {
    $button.addEventListener("click", () => {
      const field = $button.dataset.field;
      const $new = import_template($template_search_term);
      $new.dataset.field = field;
      $button.parentNode.parentNode.nextElementSibling.appendChild($new);
    });
  }

  for (const $select of $$("select[data-value]")) {
    $select.value = $select.dataset.value;
  }

  window.addEventListener("click", e => {
    if (e.target.classList.contains("search-term-button")) {
      const $button = e.target;
      switch ($button.value) {
      case "delete":
        $button.parentNode.remove();
        break;
      }
    }
  }, true);

  const $filter_form = $("#filter-form");
  $filter_form.addEventListener("submit", e => {
    e.preventDefault();

    const parts = [];

    // Always query for latest set of .search-term elements
    for (const $term of $$(".search-term")) {
      const field = $term.dataset.field;
      const prefix = {
        "require": "",
        "contain": "~",
        "exclude": "!",
      }[$term.children[0].value];
      const words = $term.children[1].value.trim();
      parts.push(`${prefix}${field}:${encodeURIComponent(words)}`);
    }

    location.href = `/jobs?q=${parts.join("|")}`;
  });

  new ClipboardJS("#share-copy-button");

  const $header_logo = $("#header-logo");
  const $$header_logo_quads = [
    [$("#ms-logo-nw"), "#f24f1c"],
    [$("#ms-logo-ne"), "#80bb00"],
    [$("#ms-logo-se"), "#ffba00"],
    [$("#ms-logo-sw"), "#00a6f0"],
  ];
  const $header_text_init = $("#header-text-init");
  const $header_text_name = $("#header-text-name");
  const $header_brands = $("#header-brands");
  const $$header_brand_icons = $$("li", $header_brands);

  const animate = (target, opts) =>
    anime({
      targets: target,
      duration: 1000,
      easing: "easeOutCubic",
      ...opts,
    }).finished;

  Promise.all([
    ...$$header_brand_icons.map(($icon, no) => animate($icon, {
      translateX: -(no * 40),
      opacity: 0,
      delay: 450 + (no * 50),
    })),
    animate($header_logo, {
      opacity: 1,
      delay: 750,
    }),
    ...$$header_logo_quads.map(([$quad, to], no) => animate($quad, {
      backgroundColor: ["#fff", to],
      delay: 950 + (no * 100),
    })),
  ]).then(() => animate($header_text_init, {
    opacity: 1,
  })).then(() => animate($header_text_init, {
    width: 0,
    delay: 2000,
  })).then(() => $header_text_init.remove()).then(() => animate($header_text_name, {
    width: "100%",
    delay: 500,
  })).then(() => {
    $header_brands.classList.remove("header-brands-init");
  }).then(() => Promise.all($$header_brand_icons.map(($icon, no) => animate($icon, {
    translateY: ["-100%", 0],
    opacity: 1,
    delay: no * 100,
  }))));
})();
