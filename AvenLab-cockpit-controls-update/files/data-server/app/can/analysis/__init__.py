"""Public feature API and route registration. No work starts at import time."""
from .shared import router
from . import queries as _queries
from . import run as _run
from . import results as _results

__all__ = ['router']
