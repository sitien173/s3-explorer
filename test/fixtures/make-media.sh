#!/usr/bin/env bash
set -euo pipefail

usage() {
	printf 'Usage: %s [--large] [outdir]\n' "${0##*/}" >&2
}

large=false
outdir=''
for arg in "$@"; do
	if [[ "$arg" == '--large' ]]; then
		if [[ "$large" == true ]]; then
			usage
			exit 2
		fi
		large=true
	elif [[ -z "$outdir" ]]; then
		outdir=$arg
	else
		usage
		exit 2
	fi
done

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/../.." && pwd)
if [[ -z "$outdir" ]]; then
	outdir="$repo_root/test/.tmp/media"
elif [[ "$outdir" != /* ]]; then
	outdir="$PWD/$outdir"
fi
mkdir -p -- "$outdir"

if ! command -v ffmpeg >/dev/null 2>&1; then
	printf 'make-media.sh requires ffmpeg on PATH\n' >&2
	exit 1
fi
if ! command -v ffprobe >/dev/null 2>&1; then
	printf 'make-media.sh requires ffprobe on PATH\n' >&2
	exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
	printf 'make-media.sh requires python3 on PATH for fixture validation\n' >&2
	exit 1
fi

temp_files=()
cleanup() {
	if ((${#temp_files[@]})); then
		rm -f -- "${temp_files[@]}"
	fi
}
trap cleanup EXIT

generate_if_missing() {
	local target=$1
	shift
	if [[ -s "$target" ]]; then
		printf 'Skipping existing fixture: %s\n' "$target"
		return
	fi
	local suffix=${target##*.}
	local temporary="${target%.*}.$$.$suffix"
	temp_files+=("$temporary")
	ffmpeg -nostdin -hide_banner -loglevel error -y "$@" "$temporary"
	mv -- "$temporary" "$target"
}

video_inputs=(
	-f lavfi -i 'testsrc2=size=320x180:rate=24'
	-f lavfi -i 'sine=frequency=1000:sample_rate=44100'
	-t 10
)

common_mp4=(
	-c:v libx264 -preset ultrafast -pix_fmt yuv420p -b:v 350k
	-c:a aac -b:a 64k -movflags +faststart
)
generate_if_missing "$outdir/faststart.mp4" \
	"${video_inputs[@]}" "${common_mp4[@]}"
generate_if_missing "$outdir/tailmoov.mp4" \
	"${video_inputs[@]}" \
	-c:v libx264 -preset ultrafast -pix_fmt yuv420p -b:v 350k \
	-c:a aac -b:a 64k

generate_if_missing "$outdir/video.webm" \
	"${video_inputs[@]}" \
	-c:v libvpx-vp9 -deadline good -cpu-used 8 -b:v 250k \
	-c:a libopus -b:a 48k

generate_if_missing "$outdir/video.mkv" \
	"${video_inputs[@]}" \
	-c:v libx264 -preset ultrafast -pix_fmt yuv420p -b:v 300k \
	-c:a libopus -b:a 48k

generate_if_missing "$outdir/audio.mp3" \
	-f lavfi -i 'sine=frequency=440:sample_rate=44100' -t 10 \
	-c:a libmp3lame -b:a 96k

generate_if_missing "$outdir/audio.flac" \
	-f lavfi -i 'sine=frequency=660:sample_rate=44100' -t 10 \
	-c:a flac

write_pdf_if_missing() {
	local target=$1
	if [[ -s "$target" ]]; then
		printf 'Skipping existing fixture: %s\n' "$target"
		return
	fi
	local temporary="${target%.*}.$$.pdf"
	temp_files+=("$temporary")
	local -a offsets
	offsets=()
	local offset
	local xref_offset
	local content

	: > "$temporary"
	printf '%%PDF-1.4\n' >> "$temporary"
	for offset in 1 2 3 4 5 6 7 8 9; do
		offsets[$offset]=0
	done

	offset=$(wc -c < "$temporary")
	offsets[1]=$offset
	printf '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' >> "$temporary"
	offset=$(wc -c < "$temporary")
	offsets[2]=$offset
	printf '2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R] /Count 3 >>\nendobj\n' >> "$temporary"

	offset=$(wc -c < "$temporary")
	offsets[3]=$offset
	printf '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R >>\nendobj\n' >> "$temporary"
	content='BT /F1 18 Tf 30 90 Td (Page 1) Tj ET'
	offset=$(wc -c < "$temporary")
	offsets[4]=$offset
	printf '4 0 obj\n<< /Length %d >>\nstream\n%s\nendstream\nendobj\n' "${#content}" "$content" >> "$temporary"

	offset=$(wc -c < "$temporary")
	offsets[5]=$offset
	printf '5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>\nendobj\n' >> "$temporary"
	content='BT /F1 18 Tf 30 90 Td (Page 2) Tj ET'
	offset=$(wc -c < "$temporary")
	offsets[6]=$offset
	printf '6 0 obj\n<< /Length %d >>\nstream\n%s\nendstream\nendobj\n' "${#content}" "$content" >> "$temporary"

	offset=$(wc -c < "$temporary")
	offsets[7]=$offset
	printf '7 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R >>\nendobj\n' >> "$temporary"
	content='BT /F1 18 Tf 30 90 Td (Page 3) Tj ET'
	offset=$(wc -c < "$temporary")
	offsets[8]=$offset
	printf '8 0 obj\n<< /Length %d >>\nstream\n%s\nendstream\nendobj\n' "${#content}" "$content" >> "$temporary"

	offset=$(wc -c < "$temporary")
	offsets[9]=$offset
	printf '9 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n' >> "$temporary"

	xref_offset=$(wc -c < "$temporary")
	printf 'xref\n0 10\n0000000000 65535 f \n' >> "$temporary"
	for offset in 1 2 3 4 5 6 7 8 9; do
		printf '%010d 00000 n \n' "${offsets[$offset]}" >> "$temporary"
	done
	printf 'trailer\n<< /Size 10 /Root 1 0 R >>\nstartxref\n%s\n%%%%EOF\n' \
		"$xref_offset" >> "$temporary"
	mv -- "$temporary" "$target"
}

write_pdf_if_missing "$outdir/doc.pdf"

if [[ "$large" == true ]]; then
	generate_if_missing "$outdir/large.mp4" \
		-f lavfi -i 'testsrc2=size=320x180:rate=24' \
		-f lavfi -i 'sine=frequency=1000:sample_rate=44100' \
		-t 10 -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
		-b:v 1800M -minrate 1800M -maxrate 1800M -bufsize 1800M \
		-x264-params nal-hrd=cbr -c:a aac -b:a 128k -movflags +faststart
	ffprobe -v error -select_streams v:0 -show_entries stream=codec_name \
		-of default=nokey=1:noprint_wrappers=1 "$outdir/large.mp4" |
		grep -qx 'h264'
	ffprobe -v error -select_streams a:0 -show_entries stream=codec_name \
		-of default=nokey=1:noprint_wrappers=1 "$outdir/large.mp4" |
		grep -qx 'aac'
	large_size=$(wc -c < "$outdir/large.mp4")
	if ((large_size < 2147483648)); then
		printf 'large.mp4 is %s bytes; expected at least 2147483648\n' \
			"$large_size" >&2
		exit 1
	fi
fi

for file in faststart.mp4 tailmoov.mp4 video.webm video.mkv audio.mp3 audio.flac doc.pdf; do
	size=$(wc -c < "$outdir/$file")
	if ((size >= 5000000)); then
		printf '%s is %s bytes; expected a small fixture under 5 MiB\n' \
			"$file" "$size" >&2
		exit 1
	fi
done

python3 - "$outdir/faststart.mp4" "$outdir/tailmoov.mp4" <<'PY'
import struct
import sys
from pathlib import Path


def top_level_atoms(path: str) -> list[tuple[bytes, int]]:
    data = Path(path).read_bytes()
    atoms: list[tuple[bytes, int]] = []
    offset = 0
    while offset < len(data):
        if len(data) - offset < 8:
            raise SystemExit(f"Truncated atom header in {path} at {offset}")
        size = struct.unpack_from(">I", data, offset)[0]
        atom_type = data[offset + 4 : offset + 8]
        header = 8
        if size == 1:
            if len(data) - offset < 16:
                raise SystemExit(f"Truncated extended atom in {path} at {offset}")
            size = struct.unpack_from(">Q", data, offset + 8)[0]
            header = 16
        elif size == 0:
            size = len(data) - offset
        if size < header or offset + size > len(data):
            raise SystemExit(f"Invalid atom size in {path} at {offset}")
        atoms.append((atom_type, offset))
        offset += size
    return atoms


for path, expected in ((sys.argv[1], "before"), (sys.argv[2], "after")):
    atoms = top_level_atoms(path)
    moov = [offset for atom, offset in atoms if atom == b"moov"]
    mdat = [offset for atom, offset in atoms if atom == b"mdat"]
    if not moov or not mdat:
        raise SystemExit(f"Missing moov or mdat atom in {path}")
    correct = max(moov) < min(mdat) if expected == "before" else min(moov) > max(mdat)
    if not correct:
        raise SystemExit(f"Expected moov {expected} mdat in {path}")
    print(f"Verified moov {expected} mdat: {Path(path).name}")
PY

python3 - "$outdir/doc.pdf" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = path.read_bytes()
if not data.startswith(b"%PDF-"):
    raise SystemExit("doc.pdf is missing its %PDF- header")
if not data.rstrip().endswith(b"%%EOF"):
    raise SystemExit("doc.pdf is missing its %%EOF trailer")
match = re.search(rb"startxref\s+(\d+)\s+%%EOF\s*$", data)
if match is None:
    raise SystemExit("doc.pdf has no startxref before %%EOF")
xref_offset = int(match.group(1))
if data[xref_offset : xref_offset + 5] != b"xref\n":
    raise SystemExit("doc.pdf startxref does not point to its xref table")
lines = data[xref_offset:].splitlines()
if len(lines) < 12 or lines[1] != b"0 10":
    raise SystemExit("doc.pdf xref table does not cover objects 0 through 9")
for number, line in enumerate(lines[3:12], start=1):
    offset = int(line[:10])
    if data[offset : offset + len(f"{number} 0 obj".encode())] != f"{number} 0 obj".encode():
        raise SystemExit(f"doc.pdf xref offset for object {number} is invalid")
if data.count(b"/Type /Page ") != 3 or b"/Count 3" not in data:
    raise SystemExit("doc.pdf must contain exactly three pages")
print("Verified doc.pdf header, trailer, three pages, and xref offsets")
PY

printf 'Media fixtures ready in %s\n' "$outdir"
