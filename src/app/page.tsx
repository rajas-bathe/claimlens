import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  ScanLine,
  ShieldCheck,
  ReceiptText,
  Fingerprint,
  Layers3,
  Globe2,
  History,
  Check,
  Sparkles,
} from "lucide-react";
import { Brand } from "@/components/shared/Brand";
import { CapabilityStudio } from "@/components/marketing/CapabilityStudio";
import styles from "@/components/marketing/Marketing.module.css";

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" aria-label="ClaimLens home">
          <Brand light />
        </Link>
        <nav aria-label="Website navigation">
          <a href="#product">The product</a>
          <a href="#how-it-works">How it works</a>
          <Link href="/login" className={styles.navCta}>
            Open workspace <ArrowUpRight size={16} />
          </Link>
        </nav>
      </header>
      <main>
        <section className={styles.hero}>
          <div className={styles.heroGrid} aria-hidden="true" />
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span /> LESS PAPERWORK. MORE PERSPECTIVE.
            </p>
            <h1>
              <span>Every receipt.</span>
              <span>A clearer</span>
              <span className={styles.gradientText}>decision.</span>
            </h1>
            <p className={styles.heroDescription}>
              Scattered receipts. Complicated policies.
              <br />
              One workspace that brings it all into focus.
            </p>
            <div className={styles.heroActions}>
              <Link href="/login" className={styles.primary}>
                Find your clarity <ArrowUpRight size={20} />
              </Link>
              <a href="#product" className={styles.secondary}>
                See it in action <ArrowRight size={17} />
              </a>
            </div>
            <p className={styles.assurance}>
              <ShieldCheck size={14} /> Original evidence. Explainable findings.
              Your call.
            </p>
          </div>
          <div
            className={styles.heroArt}
            aria-label="Illustration of a receipt becoming an explained expense decision"
          >
            <span className={styles.artCoordinate}>
              INTELLIGENCE IN EVERY DETAIL / 01
            </span>
            <div className={styles.orbit} />
            <div className={styles.orbitSecond} />
            <div className={styles.receiptEcho} />
            <div className={styles.heroReceipt}>
              <div className={styles.receiptTop}>
                <ScanLine size={28} />
                <span>
                  THE ORIGINAL
                  <br />
                  <b>Every detail matters.</b>
                </span>
                <span className={styles.receiptNumber}>001</span>
              </div>
              <div className={styles.receiptMerchant}>
                FIELDNOTES
                <br />
                CAFÉ<span>ILLUSTRATIVE RECEIPT · INR</span>
              </div>
              <div className={styles.receiptLine}>
                <span>Working lunch</span>
                <b>400.00</b>
              </div>
              <div className={styles.receiptLine}>
                <span>Tax</span>
                <b>40.00</b>
              </div>
              <div className={styles.receiptLine}>
                <span>Tip</span>
                <b>40.00</b>
              </div>
              <div className={styles.receiptTotal}>
                <span>TOTAL</span>
                <strong>₹480.00</strong>
              </div>
              <div className={styles.barcode} />
              <div className={styles.scanBeam} />
            </div>
            <div className={styles.signalCard}>
              <span className={styles.signalIcon}>
                <Sparkles size={18} />
              </span>
              <div>
                <small>POLICY CONTEXT, CONNECTED</small>
                <strong>A finding you can follow.</strong>
              </div>
              <ArrowUpRight size={18} />
            </div>
            <div className={styles.checkChip}>
              <span>
                <Check size={13} />
              </span>{" "}
              Evidence stays in view.
            </div>
            <span className={styles.artFooter}>
              CAPTURE <i /> CONTEXT <i /> CLARITY
            </span>
            <ReceiptText
              className={styles.ambientReceiptOne}
              size={75}
              strokeWidth={0.6}
            />
            <ReceiptText
              className={styles.ambientReceiptTwo}
              size={50}
              strokeWidth={0.6}
            />
          </div>
          <div className={styles.heroBottom}>
            <span>
              <i /> BUILT FOR THE DETAILS THAT MATTER
            </span>
            <a href="#product">
              Explore the workspace <span>↓</span>
            </a>
          </div>
        </section>
        <div className={styles.trustStrip}>
          <span>
            <ScanLine size={16} /> CAPTURE THE EVIDENCE
          </span>
          <i />
          <span>
            <Layers3 size={16} /> CONNECT THE POLICY
          </span>
          <i />
          <span>
            <Fingerprint size={16} /> KEEP THE HUMAN IN CONTROL
          </span>
        </div>
        <CapabilityStudio />
        <section id="how-it-works" className={styles.processSection}>
          <div className={styles.sectionIntro}>
            <div>
              <p className={styles.eyebrow}>LESS FRICTION. MORE FORWARD.</p>
              <h2>
                From pocket.
                <br />
                To <span className={styles.gradientText}>perspective.</span>
              </h2>
            </div>
            <p>
              Your receipts have a story.
              <br />
              Get to the part that matters.
            </p>
          </div>
          <div className={styles.processGrid}>
            {[
              {
                icon: ReceiptText,
                title: "Drop it in.",
                text: "Upload one receipt or bring a batch together. Keep the original evidence close.",
              },
              {
                icon: Layers3,
                title: "Connect the dots.",
                text: "Read the details alongside company policy, earlier claims and the context that matters.",
              },
              {
                icon: ShieldCheck,
                title: "Move it forward.",
                text: "Resolve what's missing. Review the findings. Record a decision with a clear trail.",
              },
            ].map(({ icon: Icon, title, text }, i) => (
              <article key={title}>
                <div>
                  <span className={styles.processIcon}>
                    <Icon size={23} strokeWidth={1.5} />
                  </span>
                  <span className={styles.processNumber}>0{i + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.capabilitiesSection}>
          <div className={styles.sectionIntro}>
            <div>
              <p className={styles.eyebrow}>BUILT FOR REAL-WORLD RECEIPTS</p>
              <h2>
                Messy inputs.
                <br />
                <span className={styles.gradientText}>Clear next steps.</span>
              </h2>
            </div>
            <p>
              Good decisions need more than a total.
              <br />
              They need the whole picture.
            </p>
          </div>
          <div className={styles.capabilityGrid}>
            {[
              {
                icon: Fingerprint,
                label: "Spot the overlap.",
                text: "Exact and probable duplicate matches bring related receipts into the review.",
              },
              {
                icon: Globe2,
                label: "Keep currencies honest.",
                text: "Separate monetary values. Make uncertainty and conversion provenance visible.",
              },
              {
                icon: History,
                label: "Keep the story intact.",
                text: "Original evidence, employee corrections and finance decisions stay connected.",
              },
            ].map(({ icon: Icon, label, text }) => (
              <article key={label}>
                <Icon size={24} strokeWidth={1.5} />
                <h3>{label}</h3>
                <p>{text}</p>
                <span className={styles.cardCorner}>↗</span>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.cta}>
          <div className={styles.ctaGlow} aria-hidden="true" />
          <p className={styles.eyebrow}>YOUR NEXT EXPENSE, SIMPLIFIED.</p>
          <h2>
            Less chasing.
            <br />
            <span className={styles.gradientText}>More clarity.</span>
          </h2>
          <Link href="/login" className={styles.primary}>
            Step into your workspace <ArrowUpRight size={19} />
          </Link>
          <p>Every expense. A clearer picture.</p>
        </section>
      </main>
      <footer className={styles.footer}>
        <Brand light />
        <span>Evidence first. People in control.</span>
        <Link href="/login">
          Your workspace <ArrowUpRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
