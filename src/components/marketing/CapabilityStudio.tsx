"use client";
import { useEffect, useRef, useState } from "react";
import {
  ScanLine,
  ShieldCheck,
  GitBranch,
  Check,
  FileText,
  Pause,
  Play,
  CornerDownRight,
  Info,
} from "lucide-react";
import styles from "./Marketing.module.css";

const stages = [
  {
    label: "Capture",
    icon: ScanLine,
    kicker: "01 / KEEP THE ORIGINAL",
    title: "The details, without the detective work.",
    text: "A receipt becomes structured evidence. Printed figures, handwritten additions, and uncertain fields keep their own place in the picture.",
  },
  {
    label: "Understand",
    icon: ShieldCheck,
    kicker: "02 / ADD THE RIGHT CONTEXT",
    title: "Your policy. Applied in perspective.",
    text: "The right employee, spending period and currency matter. See which receipts contribute, which rule applies, and what still needs clarification.",
  },
  {
    label: "Decide",
    icon: GitBranch,
    kicker: "03 / MAKE A DEFENSIBLE DECISION",
    title: "A clear next step. A lasting record.",
    text: "Review the findings, ask for missing details, or record a permitted decision. An exception needs an explanation; a passed check still needs your approval.",
  },
];
export function CapabilityStudio() {
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(true);
  const root = useRef<HTMLElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.3 },
    );
    if (root.current) observer.observe(root.current);
    return () => {
      media.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (paused || reduced || !visible) return;
    const timer = setInterval(() => setStage((s) => (s + 1) % 3), 6500);
    return () => clearInterval(timer);
  }, [paused, reduced, visible]);
  const current = stages[stage];
  return (
    <section
      ref={root}
      id="product"
      className={styles.studioSection}
      aria-label="Interactive product walkthrough"
    >
      <div className={styles.sectionIntro}>
        <div>
          <p className={styles.kicker}>THE PRODUCT, IN FOCUS</p>
          <h2>
            One receipt.
            <br />
            <em>The whole picture.</em>
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
            className={styles.tabs}
            role="tablist"
            aria-label="Expense workflow"
          >
            {stages.map(({ label, icon: Icon }, index) => (
              <button
                key={label}
                ref={(el) => {
                  tabs.current[index] = el;
                }}
                id={"workflow-tab-" + index}
                role="tab"
                type="button"
                aria-selected={stage === index}
                aria-controls="workflow-panel"
                tabIndex={stage === index ? 0 : -1}
                onClick={() => {
                  setStage(index);
                  setPaused(true);
                }}
                onKeyDown={(e) => {
                  let next = stage;
                  if (e.key === "ArrowRight") next = (stage + 1) % 3;
                  else if (e.key === "ArrowLeft") next = (stage + 2) % 3;
                  else if (e.key === "Home") next = 0;
                  else if (e.key === "End") next = 2;
                  else return;
                  e.preventDefault();
                  setStage(next);
                  setPaused(true);
                  tabs.current[next]?.focus();
                }}
                className={stage === index ? styles.selectedTab : ""}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          <div
            key={stage}
            className={styles.stageCopy}
            role="tabpanel"
            id="workflow-panel"
            aria-labelledby={"workflow-tab-" + stage}
          >
            <p className={styles.kicker}>{current.kicker}</p>
            <h3>{current.title}</h3>
            <p>{current.text}</p>
          </div>
          <div className={styles.demoPlayback}>
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
              type="button"
              aria-label={paused ? "Play walkthrough" : "Pause walkthrough"}
              disabled={reduced}
              onClick={() => setPaused((p) => !p)}
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
            <strong>ClaimLens / Expense review</strong>
            <span className={styles.exampleLabel}>ILLUSTRATIVE EXAMPLE</span>
          </div>
          <div className={styles.demoCanvas}>
            <div className={styles.demoReceipt}>
              <div className={styles.receiptEmblem}>
                <FileText size={22} />
              </div>
              <span>FIELDNOTES CAFE</span>
              <small>12 OCT 2026 · USD</small>
              <div className={styles.dottedLine} />
              <div>
                <span>Working lunch</span>
                <strong>18.00</strong>
              </div>
              <div>
                <span>Coffee</span>
                <strong>4.00</strong>
              </div>
              <div>
                <span>Tax</span>
                <strong>2.00</strong>
              </div>
              <div className={styles.dottedLine} />
              <div className={styles.receiptTotal}>
                <span>Total</span>
                <strong>24.00</strong>
              </div>
              <small>Original evidence stays available.</small>
              {stage === 0 && <span className={styles.demoScan} />}
            </div>
            <div key={stage} className={styles.analysisCard}>
              <div className={styles.analysisIcon}>
                {stage === 0 ? (
                  <ScanLine size={19} />
                ) : stage === 1 ? (
                  <ShieldCheck size={19} />
                ) : (
                  <GitBranch size={19} />
                )}
              </div>
              <p className={styles.analysisKicker}>
                {stage === 0
                  ? "RECEIPT DETAILS"
                  : stage === 1
                    ? "POLICY CONTEXT"
                    : "YOUR NEXT STEP"}
              </p>
              <h4>
                {stage === 0
                  ? "A clearer starting point."
                  : stage === 1
                    ? "The right allowance."
                    : "Ready for a human decision."}
              </h4>
              {stage === 0 ? (
                <>
                  <div className={styles.evidenceRow}>
                    <span>Merchant</span>
                    <strong>
                      Fieldnotes Cafe <Check size={12} />
                    </strong>
                  </div>
                  <div className={styles.evidenceRow}>
                    <span>Original amount</span>
                    <strong>USD 24.00</strong>
                  </div>
                  <div className={styles.evidenceRow}>
                    <span>Arithmetic</span>
                    <strong>18 + 4 + 2 = 24</strong>
                  </div>
                  <p className={styles.demoHint}>
                    <CornerDownRight size={13} />
                    Review extracted fields before submission.
                  </p>
                </>
              ) : stage === 1 ? (
                <>
                  <div className={styles.evidenceRow}>
                    <span>Example daily allowance</span>
                    <strong>USD 25.00</strong>
                  </div>
                  <div className={styles.allowanceMeter}>
                    <span style={{ width: "96%" }} />
                  </div>
                  <p className={styles.meterCaption}>
                    24.00 of 25.00 · This example only
                  </p>
                  <div className={styles.contextNote}>
                    <ShieldCheck size={15} />
                    <span>
                      Same employee. Same date.
                      <br />
                      Same comparison currency.
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <p className={styles.decisionExplanation}>
                    Within this example’s limit. The reviewer checks the receipt
                    and records the decision.
                  </p>
                  <div className={styles.exampleAction}>
                    <Check size={14} />
                    Finance approval still required
                  </div>
                  <p className={styles.demoHint}>
                    <FileText size={13} />
                    The decision and its reason stay together.
                  </p>
                </>
              )}
            </div>
          </div>
          <div className={styles.demoFooter}>
            <Info size={12} />
            <span>
              Example figures explain the workflow. Your workspace uses your own
              receipts and confirmed policy.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
