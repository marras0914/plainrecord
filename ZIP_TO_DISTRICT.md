# A ZIP code is not a district, and land is not people

To show someone how their own state representative voted, you have to know which
district they live in. In Texas that is harder than it sounds, and the way it
goes wrong is more interesting than the way it goes right.

## There is no file for this

As far as I can tell, no official source maps a ZIP code to a Texas House
district. ZIP codes are mail delivery routes owned by the Postal Service.
Districts are drawn by the legislature. Neither one is built with the other in
mind, and nothing obliges them to line up.

They do not line up. Of the 1,992 Texas ZIPs in the file, 913 sit in more than
one House district: 623 span two districts, 223 span three, 61 span four, and 6
span five. Nearly half the state's ZIPs cannot answer "which district am I in"
at all. The question is ambiguous before you start.

## Do not intersect the polygons

The obvious approach is to take the ZIP boundaries and the district boundaries
as shapes and intersect them. Do not. Two boundaries drawn by different agencies
from different base maps will graze each other constantly, and every graze
produces a sliver of overlap that is real in the geometry and meaningless on the
ground. Afterwards you cannot tell a sliver from a district that genuinely holds
a third of the ZIP, because both are just small numbers in the same column.

There is a better join available. The Census Bureau publishes 2020 tabulation
blocks, and blocks nest inside both ZCTAs and legislative districts by
construction. So the crosswalk is an ID join, not a geometric one: block to
ZCTA, block to district, block to population, matched on identifiers. 651,494
Texas blocks joined, none unmatched. No slivers, because no geometry was
intersected.

## The block assignment file is a trap

There are two plausible files mapping Texas blocks to state House districts. One
is the 2020 Block Assignment File. The other is the 2022 plan. Both are well
formed, both are published by the same agency, both load without complaint, and
they disagree about a third of Texas blocks.

Nothing in either file tells you that you picked the wrong one. The crosswalk
would build cleanly, pass every internal consistency check, and be wrong for a
third of the state. So the file the build uses is pinned by sha256 in the
metadata, and the hash is published next to the URL. That is not defensive
programming for its own sake. It is the only thing standing between this dataset
and a silent, total error.

## The part I got wrong

Once a ZIP spans several districts, you have to put them in some order, because
a list sorted largest first is read as a claim about where the reader probably
lives whether you intend it that way or not.

I ordered them by share of land area. It is the number you already have from the
geometry, and it sounds neutral.

It is not neutral. It is a claim about dirt, presented to a person.

Ordering by land puts a different district at the top for 108 of the 913 split
ZIPs. Some of those are not close:

| ZIP | Land says | People say |
| --- | --- | --- |
| 78245, San Antonio, 93,031 residents | HD-118, with 40% of the land and 4.4% of the people | HD-124, with 58.4% of the people |
| 78521, Brownsville, 88,708 residents | HD-37, with 70% of the land and 6.9% of the people | HD-38, with 93.1% of the people |
| 79938, El Paso, 96,353 residents | HD-74, with 82% of the land | HD-75 |
| 75148 | HD-8, with 57% of the land and 13.4% of the people | HD-4, with 86.6% of the people |

In 78521, seven in ten acres and seven in a hundred people. A land-ordered list
hands a Brownsville reader the wrong representative first, in a ZIP where more
than 88,000 people live. The empty half of a ZIP is usually empty for a reason,
and the reason is that nobody lives there.

The file counts people now, from the 2020 census, most people first. It still
publishes the land share beside each entry, so the ordering can be audited by
anyone who wants to check that it is what I say it is.

## Two details for anyone who downloads it

The people figure is a head count, not a percentage. That is deliberate: a share
cannot distinguish "nobody lives in this part" from "almost nobody does", and
those are different answers to a reader standing in one of them. The counts for
a ZIP sum to its population.

If you recompute the 108 yourself from the published percentages, you will not
get 108. I get 107 or 111 depending on how I break ties. The build measures it
on the exact shares before rounding; the published land shares are rounded to
whole percents, so rounding creates ties, and which district a tie hands the
top spot to depends on a sort you are free to write differently than I did. The
check in the repo asserts the two agree within a small tolerance rather than
exactly, and what it is really there to catch is the number being zero, which is
what a file whose population shares had silently fallen back to land would look
like.

## The file

`rightnleft.com/data/zips_89R.json`, CC0, CORS open. Sources, the pinned hash
and the join method are in the file's own metadata rather than in a README that
can drift away from it. Nothing is pruned: every district a ZIP touches is
listed, because the reader picks from the list, and a surplus entry is cheaper
than a missing one.

If your state has the same problem, the method transfers. The blocks nest
everywhere.
