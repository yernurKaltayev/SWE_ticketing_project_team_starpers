import { Component, createRef } from "react";
import type { ReactNode } from "react";
import type { Locale } from "@biletflow/shared";

const copy = {
  en: {
    title: "This page couldn’t open",
    description: "Try opening it again or return to events.",
    check:
      "If you were submitting an order or payment, check My orders before trying that action again.",
    retry: "Try opening this page again",
    events: "Back to events",
    orders: "My orders",
  },
  ru: {
    title: "Не удалось открыть страницу",
    description: "Попробуйте открыть её снова или вернитесь к событиям.",
    check:
      "Если вы оформляли заказ или платёж, проверьте «Мои заказы» перед повтором действия.",
    retry: "Открыть страницу снова",
    events: "К событиям",
    orders: "Мои заказы",
  },
  kk: {
    title: "Бет ашылмады",
    description: "Бетті қайта ашып көріңіз немесе іс-шараларға оралыңыз.",
    check:
      "Тапсырыс не төлем жіберген болсаңыз, әрекетті қайталаудан бұрын «Менің тапсырыстарым» бөлімін тексеріңіз.",
    retry: "Бетті қайта ашу",
    events: "Іс-шараларға оралу",
    orders: "Менің тапсырыстарым",
  },
};

/** Contains render/effect/lazy-loading failures. Retrying only remounts the view;
 * order and payment mutations always remain explicit actions. */
export class PageErrorBoundary extends Component<
  {
    children: ReactNode;
    locale?: Locale;
    navigation?: ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };
  private heading = createRef<HTMLHeadingElement>();
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidMount() {
    if (this.state.failed) this.heading.current?.focus();
  }
  componentDidUpdate(_props: unknown, previous: { failed: boolean }) {
    if (this.state.failed && !previous.failed) this.heading.current?.focus();
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const lang = this.props.locale ?? document.documentElement.lang;
    const t = copy[lang === "kk" || lang === "ru" ? lang : "en"];
    return (
      <section role="alert" className="page-error">
        <h1 ref={this.heading} tabIndex={-1}>
          {t.title}
        </h1>
        <p>{t.description}</p>
        <p>{t.check}</p>
        <div className="controls">
          <button onClick={() => this.setState({ failed: false })}>
            {t.retry}
          </button>
          {this.props.navigation ?? (
            <>
              <a href="/events">{t.events}</a>
              <a href="/account/orders">{t.orders}</a>
            </>
          )}
        </div>
      </section>
    );
  }
}
