from app.tasks.worker import JOBS, build_scheduler


def test_every_job_is_scheduled_without_overlap():
    jobs = build_scheduler().get_jobs()
    assert len(jobs) == len(JOBS)
    assert all(job.max_instances == 1 for job in jobs)
