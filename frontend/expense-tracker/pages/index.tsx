
import Layout from "./Layout";
import styles from "./page.module.css";

export default function Home() {
  return (
    <Layout>
      <main className={styles.main}>
          <div className={styles.description}>
              main class
          </div>
      </main>
    </Layout>
  );
}
