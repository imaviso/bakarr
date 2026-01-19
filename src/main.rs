use bakarr::run;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    run().await
}
