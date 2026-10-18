import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ReceiptText,
  ShieldCheck,
  ScanLine,
  Check,
  CircleCheck,
  MoveRight,
  Files,
  Globe2,
  History,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { Brand } from "@/components/shared/Brand";
import { CapabilityStudio } from "@/components/marketing/CapabilityStudio";
import styles from "@/components/marketing/Marketing.module.css";
export default function LandingPage() {
  return (
    <div className={styles.page}>
      <div className={styles.ambient} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.ambientReceipt}>
            <ReceiptText size={100} strokeWidth={0.5} />
          </div>
        ))}
      </div>
      <header className={styles.nav}>
        <Link href="/" aria-label="ClaimLens home">
          <Brand />
        </Link>
        <nav aria-label="Website navigation">
          <a href="#product">The product</a>
          <a href="#how-it-works">How it works</a>
          <Link href="/login" className="button button-small">
            Your workspace <ArrowUpRight size={15} />
          </Link>
        </nav>
      </header>
      <main>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span /> EXPENSES, WITH PERSPECTIVE.
            </p>
            <h1>
              <span>Every receipt.</span>
              <span>
                A <em>clearer</em>
              </span>
              <span>
                <em>decision.</em>
              </span>
            </h1>
            <p className={styles.heroDescription}>
              Less time piecing things together.
              <br />A thoughtful workspace that turns scattered receipts,
              company policy, and missing context into a clear next step.
            </p>
            <div className={styles.heroActions}>
              <Link href="/login" className="button">
                Find your clarity <ArrowRight size={17} />
              </Link>
              <a href="#product" className={styles.textLink}>
                Take a closer look <ChevronRight size={15} />
              </a>
            </div>
            <p className={styles.assurance}>
              <ShieldCheck size={14} />
              Original evidence. Explainable findings. People in control.
            </p>
          </div>
          <div className={styles.heroArt}>
            <div className={styles.orbitOne} />
            <div className={styles.orbitTwo} />
            <span className={styles.artCaption}>FROM PAPER TO PERSPECTIVE</span>
            <div className={styles.heroReceipt}>
              <div className={styles.receiptBrand}>
                <ReceiptText size={27} />
                <span>
                  THE ORIGINAL
                  <br />
                  <strong>Your receipt.</strong>
                </span>
              </div>
              <div className={styles.dottedLine} />
              <div className={styles.receiptSkeleton} />
              <div className={styles.receiptSkeletonShort} />
              <div className={styles.dottedLine} />
              <div className={styles.heroEvidence}>
                <span>Merchant & date</span>
                <Check size={13} />
              </div>
              <div className={styles.heroEvidence}>
                <span>Amounts & items</span>
                <Check size={13} />
              </div>
              <div className={styles.heroEvidence}>
                <span>Business context</span>
                <Check size={13} />
              </div>
              <div className={styles.dottedLine} />
              <span className={styles.receiptSignature}>
                A little detail.
                <br />
                <em>A lot of clarity.</em>
              </span>
              <span className={styles.heroScan} />
            </div>
            <div className={styles.policyFloat}>
              <span>
                <ShieldCheck size={18} />
              </span>
              <div>
                <small>THE RIGHT CONTEXT</small>
                <strong>Your policy, considered.</strong>
              </div>
            </div>
            <div className={styles.decisionFloat}>
              <CircleCheck size={20} />
              <div>
                <small>THE NEXT STEP</small>
                <strong>A decision you can explain.</strong>
              </div>
            </div>
            <div className={styles.artFooter}>
              <span>CAPTURE</span>
              <MoveRight size={14} />
              <span>UNDERSTAND</span>
              <MoveRight size={14} />
              <span>DECIDE</span>
            </div>
          </div>
        </section>
        <div className={styles.productPrinciples}>
          <span>Built around the work that matters.</span>
          <div>
            <ScanLine size={15} />
            Faithful capture
          </div>
          <div>
            <ShieldCheck size={15} />
            Policy in context
          </div>
          <div>
            <History size={15} />A traceable decision
          </div>
        </div>
        <CapabilityStudio />
        <section id="how-it-works" className={styles.processSection}>
          <div className={styles.sectionIntro}>
            <div>
              <p className={styles.kicker}>A BETTER WAY THROUGH</p>
              <h2>
                Less back and forth.
                <br />
                <em>More moving forward.</em>
              </h2>
            </div>
            <p>
              For the people submitting expenses.
              <br />
              And the people making sense of them.
            </p>
          </div>
          <div className={styles.processGrid}>
            {[
              {
                number: "01",
                icon: ReceiptText,
                title: "Start with the receipt.",
                text: "Upload an image or PDF. Review the extracted details and add the context only you know.",
              },
              {
                number: "02",
                icon: ShieldCheck,
                title: "Put it in perspective.",
                text: "See the relevant company rules, contributing receipts, and anything that still needs a closer look.",
              },
              {
                number: "03",
                icon: CircleCheck,
                title: "Make the next move.",
                text: "Answer a question, review an exception, or record a permitted decision with a clear reason.",
              },
            ].map(({ number, icon: Icon, title, text }) => (
              <article key={number} className={styles.processCard}>
                <div>
                  <span>{number}</span>
                  <Icon size={24} strokeWidth={1.4} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.capabilities}>
          <div className={styles.sectionIntro}>
            <div>
              <p className={styles.kicker}>THE DETAILS MAKE THE DIFFERENCE</p>
              <h2>
                Thoughtful at
                <br />
                <em>every step.</em>
              </h2>
            </div>
            <p>
              Useful clarity, especially
              <br />
              when the evidence isn’t perfect.
            </p>
          </div>
          <div className={styles.capabilityGrid}>
            {[
              {
                icon: Files,
                label: "Look twice. Submit once.",
                text: "Exact-file and probable-duplicate findings bring related receipts into view for human review.",
              },
              {
                icon: Globe2,
                label: "Keep currencies in context.",
                text: "Original amounts stay visible. Comparisons need compatible currencies and documented conversion evidence.",
              },
              {
                icon: MessageSquare,
                label: "Make uncertainty useful.",
                text: "Missing dates, unclear amounts, and unresolved policy details have a visible next step.",
              },
              {
                icon: History,
                label: "Keep the story together.",
                text: "Original evidence, employee corrections, policy findings, and review decisions stay connected.",
              },
            ].map(({ icon: Icon, label, text }) => (
              <article key={label}>
                <span className={styles.capabilityIcon}>
                  <Icon size={20} strokeWidth={1.6} />
                </span>
                <h3>{label}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.cta}>
          <div className={styles.ctaRings} aria-hidden="true" />
          <div>
            <p className={styles.kicker}>YOUR NEXT EXPENSE, SIMPLIFIED</p>
            <h2>
              Good decisions start
              <br />
              with a <em>clearer view.</em>
            </h2>
          </div>
          <Link href="/login" className="button button-light">
            Step into your workspace <ArrowUpRight size={17} />
          </Link>
        </section>
      </main>
      <footer className={styles.footer}>
        <Brand />
        <span>Every expense. A clearer picture.</span>
        <Link href="/login">
          Your workspace <ArrowUpRight size={13} />
        </Link>
      </footer>
    </div>
  );
}
