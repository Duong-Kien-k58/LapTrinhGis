"""Conform the local foreign-country seam to vn_tinh, without moving vn_tinh.

This is cartographic edge matching of two different source resolutions, not a
datum shift. Originals are retained in reference_backup_20261025 and pg_dump.
The prior regional source supplies nearby land edges; all edits are restricted
to a 10 km corridor around the existing Vietnam land border (plus removal of
foreign overlaps with the authoritative vn_tinh geometry).
"""
from django.db import migrations


def prepare(cursor):
    cursor.execute('''CREATE TEMP TABLE reference_vn ON COMMIT DROP AS
        SELECT ST_Transform(ST_UnaryUnion(ST_Collect(geom)),32648) geom FROM public.vn_tinh''')
    cursor.execute('''CREATE TEMP TABLE border_candidates ON COMMIT DROP AS
        SELECT f.gid, f.adm0_a3, ST_Transform(f.geom,32648) original,
            ST_Transform(old.geom,32648) old_original,
            ST_Intersection(ST_Boundary(v.geom),ST_Buffer(ST_Transform(old.geom,32648),300)) reference,
            NULL::geometry candidate
        FROM public.nuocngoai f, reference_vn v, reference_backup_20261025.nuocngoai old
        WHERE (f.adm0_a3='CHN' AND old.ten='TRUNG QUỐC')
           OR (f.adm0_a3='LAO' AND old.ten='LÀO')
           OR (f.adm0_a3='KHM' AND old.ten='CAMPUCHIA')''')
    cursor.execute('SELECT count(*) FROM border_candidates')
    if cursor.fetchone()[0] != 3:
        raise RuntimeError('Missing original regional country geometries; stop alignment.')
    # Simplification applies only to the splice mask and old auxiliary land mask.
    # The province geometry used to cut the final border retains every vertex.
    cursor.execute('''CREATE TEMP TABLE correction_zone ON COMMIT DROP AS
        SELECT ST_Buffer(ST_Simplify(ST_UnaryUnion(ST_Collect(reference)),20),10000) geom
        FROM border_candidates''')
    for code in ('CHN', 'KHM', 'LAO'):
        cursor.execute('''UPDATE border_candidates f SET candidate=ST_Multi(ST_CollectionExtract(
            ST_Difference(ST_MakeValid(ST_Union(
                ST_Difference(original,z.geom),
                ST_Difference(ST_Intersection(ST_Buffer(ST_SimplifyPreserveTopology(old_original,5),300),z.geom),
                    (SELECT ST_UnaryUnion(ST_Collect(ST_SimplifyPreserveTopology(other.old_original,5)))
                     FROM border_candidates other WHERE other.adm0_a3<>f.adm0_a3))
            )),v.geom),3)) FROM reference_vn v, correction_zone z WHERE adm0_a3=%s''', [code])
    # Resolve tiny overlaps in the old auxiliary coverage deterministically.
    cursor.execute('''UPDATE border_candidates f SET candidate=ST_Multi(ST_CollectionExtract(
        ST_Difference(candidate,(SELECT ST_UnaryUnion(ST_Collect(other.candidate))
            FROM border_candidates other WHERE other.adm0_a3<f.adm0_a3)),3))
        WHERE adm0_a3='LAO' ''')
    cursor.execute('''SELECT adm0_a3 FROM border_candidates, reference_vn v
        WHERE NOT ST_IsValid(candidate) OR ST_IsEmpty(candidate)
           OR ST_Area(ST_Intersection(candidate,v.geom))>0.01
           OR ST_Area(ST_SymDifference(original,candidate))>ST_Area(original)*0.05''')
    if cursor.fetchall():
        raise RuntimeError('Alignment failed geometry, overlap or maximum-change checks.')
    # Audit the common outer seam. Individual masks overlap at three-country
    # junctions, where the deterministic ownership step must not count twice.
    cursor.execute('''WITH seam AS (SELECT ST_UnaryUnion(ST_Collect(reference)) reference,
        ST_Boundary(ST_UnaryUnion(ST_Collect(candidate))) boundary FROM border_candidates)
        SELECT ST_Length(reference), ST_Length(ST_Difference(reference,ST_Buffer(boundary,0.1))) FROM seam''')
    total, unmatched = cursor.fetchone()
    if not total or unmatched > 100:
        raise RuntimeError(f'Unmatched reference border: {unmatched} m of {total} m')
    return {'reference_border_m': total, 'unmatched_border_m': unmatched}


def align(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SET LOCAL lock_timeout = '10s'")
        cursor.execute("SET LOCAL statement_timeout = '180s'")
        prepare(cursor)
        cursor.execute('''CREATE TABLE reference_backup_20261025.nuocngoai_before_alignment
            AS TABLE public.nuocngoai''')
        cursor.execute('''UPDATE public.nuocngoai f SET geom=ST_Transform(c.candidate,4326)
            FROM border_candidates c WHERE f.gid=c.gid''')
        if cursor.rowcount != 3:
            raise RuntimeError('Unexpected updated feature count; alignment rolled back.')
        cursor.execute('ANALYZE public.nuocngoai')


class Migration(migrations.Migration):
    dependencies = [('mygis', '0003_replace_reference_layers')]
    # Reverse explicitly through a new forward migration from the saved originals.
    operations = [migrations.RunPython(align)]
