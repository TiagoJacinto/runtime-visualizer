validate() {
  slug=$1

  case "$slug" in
  '' | *[!a-z0-9-]* | -* | *- | *--*)
    printf 'Invalid slug: %s\n' "$slug" >&2
    return 1
    ;;
  esac
}
