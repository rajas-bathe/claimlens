"use client";
import { useEffect, useRef, useState } from "react";
import {
  ScanLine,
  Layers3,
  ShieldCheck,
  Check,
  ArrowUpRight,
  Pause,
  Play,
  ReceiptText,
  AlertCircle,
} from "lucide-react";
import styles from "./Marketing.module.css";
const steps = [
  {
    label: "Capture",
    icon: ScanLine,
    title: "The details. In focus.",
    text: "Read receipt evidence without losing sight of the original. Unclear information stays visible, ready to resolve.",
  },
  {
    label: "Understand",
    icon: Layers3,
    title: "Policy meets context.",
    text: "Connect the receipt to the applicable policy and earlier claims. See what contributed to every finding.",
  },
  {
    label: "Decide",
    icon: ShieldCheck,
    title: "A next step. With reasons.",
    text: "Resolve uncertainty, ask for missing details or record a finance decision. Keep a clear history of what happened.",
  },
];
export function CapabilityStudio() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.25 },
    );
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", sync);
    };
  }, []);
  useEffect(() => {
    if (paused || reduced || !visible) return;
    const timer = setInterval(() => setStep((s) => (s + 1) % 3), 6500);
    return () => clearInterval(timer);
  }, [paused, reduced, visible]);
  return (
    <section ref={root} id="product" className={styles.studioSection}>
      <div className={styles.sectionIntro}>
        <div>
          <p className={styles.eyebrow}>THE PRODUCT, IN FOCUS</p>
          <h2>
            One receipt.
            <br />
            <span className={styles.gradientText}>The whole picture.</span>
          </h2>
        </div>
        <p>
          Follow the path from a piece of paper
          <br />
          to a decision you can stand behind.
        </p>
      </div>
      <div className={styles.studio} onFocusCapture={() => setPaused(true)}>
        <div className={styles.studioCopy}>
          <div
            role="tablist"
            aria-label="Expense workflow"
            className={styles.tabs}
          >
            {steps.map(({ label, icon: Icon }, i) => (
              <button
                key={label}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                id={"workflow-tab-" + i}
                role="tab"
                aria-selected={step === i}
                aria-controls="workflow-panel"
                tabIndex={step === i ? 0 : -1}
                className={step === i ? styles.selectedTab : ""}
                onClick={() => {
                  setStep(i);
                  setPaused(true);
                }}
                onKeyDown={(e) => {
                  const next =
                    e.key === "ArrowRight"
                      ? (step + 1) % 3
                      : e.key === "ArrowLeft"
                        ? (step + 2) % 3
                        : e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? 2
                            : null;
                  if (next === null) return;
                  e.preventDefault();
                  setStep(next);
                  setPaused(true);
                  tabs.current[next]?.focus();
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          <div
            key={step}
            className={styles.stageCopy}
            role="tabpanel"
            id="workflow-panel"
            aria-labelledby={"workflow-tab-" + step}
          >
            <p className={styles.eyebrow}>
              0{step + 1} / FROM EVIDENCE TO ACTION
            </p>
            <h3>{steps[step].title}</h3>
            <p>{steps[step].text}</p>
          </div>
          <div className={styles.playback}>
            <span>
              <i
                className={
                  !paused && !reduced ? styles.playingDot : styles.staticDot
                }
              />
              {reduced
                ? "Choose a step to explore"
                : paused
                  ? "Explore at your pace"
                  : "A guided look inside"}
            </span>
            <button
              disabled={reduced}
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Play walkthrough" : "Pause walkthrough"}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
          </div>
        </div>
        <div className={styles.demoWindow}>
          <div className={styles.windowBar}>
            <span>
              <i />
              <i />
              <i />
            </span>
            <b>ClaimLens / Expense review</b>
            <small>ILLUSTRATIVE EXAMPLE</small>
          </div>
          <div className={styles.demoCanvas}>
            <div className={styles.miniReceipt}>
              <div>
                <ReceiptText size={21} />
                <small>ORIGINAL EVIDENCE</small>
              </div>
              <h4>Fieldnotes Café</h4>
              <p>12 OCT 2026 · OFFICE LUNCH</p>
              <dl>
                <div>
                  <dt>Working lunch</dt>
                  <dd>400.00</dd>
                </div>
                <div>
                  <dt>Tax + tip</dt>
                  <dd>80.00</dd>
                </div>
              </dl>
              <footer>
                <span>TOTAL INR</span>
                <strong>480.00</strong>
              </footer>
              <div className={styles.barcode} />
            </div>
            <div className={styles.demoConnector}>
              <span />
              <ArrowUpRight size={21} />
              <span />
            </div>
            <div key={step} className={styles.findingCard}>
              <span className={styles.findingIcon}>
                {step === 0 ? (
                  <ScanLine size={24} />
                ) : step === 1 ? (
                  <Layers3 size={24} />
                ) : (
                  <ShieldCheck size={24} />
                )}
              </span>
              <p className={styles.eyebrow}>
                {["RECEIPT DETAILS", "POLICY CONTEXT", "REVIEW FINDING"][step]}
              </p>
              <h4>
                {
                  [
                    "Evidence captured.",
                    "The right context.",
                    "Ready for a review.",
                  ][step]
                }
              </h4>
              {step === 0 ? (
                <div className={styles.factList}>
                  <p>
                    <span>Merchant</span>
                    <b>Fieldnotes Café</b>
                  </p>
                  <p>
                    <span>Original total</span>
                    <b>INR 480.00</b>
                  </p>
                  <p>
                    <span>Currency evidence</span>
                    <b>Explicit INR</b>
                  </p>
                </div>
              ) : step === 1 ? (
                <div className={styles.factList}>
                  <p>
                    <span>Example office cap</span>
                    <b>INR 500.00 / day</b>
                  </p>
                  <p>
                    <span>Earlier spending</span>
                    <b>INR 0.00</b>
                  </p>
                  <p>
                    <span>Current receipt</span>
                    <b>INR 480.00</b>
                  </p>
                </div>
              ) : (
                <div className={styles.factList}>
                  <p>
                    <span>
                      <Check size={13} /> Within example limit
                    </span>
                  </p>
                  <p>
                    <span>
                      <Check size={13} /> Evidence available
                    </span>
                  </p>
                  <p>
                    <span>
                      <AlertCircle size={13} /> Finance decision required
                    </span>
                  </p>
                </div>
              )}
              <div className={styles.demoOutcome}>
                <i />
                {step === 2
                  ? "Checks inform. People decide."
                  : "Every finding has a source."}
              </div>
            </div>
          </div>
          <div className={styles.demoFootnote}>
            <ShieldCheck size={13} /> Example only. Actual findings use your
            company policy and receipt evidence.
          </div>
        </div>
      </div>
    </section>
  );
}
