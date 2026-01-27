use bakarr::{Config, run};

fn main() -> anyhow::Result<()> {
    let config = Config::load()?;
    let worker_threads = config.general.worker_threads;

    let mut builder = tokio::runtime::Builder::new_multi_thread();
    builder.enable_all();

    if worker_threads > 0 {
        builder.worker_threads(worker_threads);
    }

    let runtime = builder.build()?;
    runtime.block_on(run())
}
