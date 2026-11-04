from datetime import date
from uuid import UUID

from pydantic import BaseModel


class Point(BaseModel):
    date: date
    tickets: int
    revenue: int


class Row(BaseModel):
    ticket_type_id: UUID
    name: str
    sold: int
    revenue: int


class CampaignStat(BaseModel):
    campaign_id: UUID
    name: str
    redemptions: int
    revenue: int


class AnalyticsOut(BaseModel):
    capacity: int
    sold: int
    remaining: int
    percent_sold: float
    gross: int
    discounts: int
    refunds: int
    net: int
    sales_over_time: list[Point]
    by_ticket_type: list[Row]
    campaigns: list[CampaignStat]
    checked_in: int
    absent: int
    checkin_percent: float
